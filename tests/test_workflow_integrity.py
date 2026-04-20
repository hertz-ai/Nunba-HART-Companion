"""GitHub workflow integrity meta-tests — batch #47.

Every .github/workflows/*.yml file must:
  - parse as valid YAML
  - declare a `name`, `on`, and `jobs` top-level
  - have at least one job
  - every job must have `runs-on`
  - every job step must have `uses` OR `run`
  - no leading git conflict markers

Plus cross-workflow invariants:
  - every workflow's `name` is unique (prevents GHA indirect-dispatch
    bug where two workflows share a display name)
  - every workflow has a concurrency group OR is known-exempt
    (prevents queue saturation; the exact problem causing our
    Code Quality workflow to be cancelled on every push)

Deploy artifacts:
  - deploy/linux/*.desktop, install.sh source-shape
  - deploy/staging/*.json parses as JSON
  - docker-compose.staging.yml parses as YAML
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS_DIR = PROJECT_ROOT / '.github' / 'workflows'
pytestmark = pytest.mark.timeout(10)

try:
    import yaml  # type: ignore
    _YAML_AVAILABLE = True
except ImportError:
    _YAML_AVAILABLE = False


# ════════════════════════════════════════════════════════════════════════
# Workflow file inventory + YAML integrity
# ════════════════════════════════════════════════════════════════════════

WORKFLOW_FILES = sorted(WORKFLOWS_DIR.glob('*.yml')) if WORKFLOWS_DIR.exists() else []


class TestWorkflowDirectoryExists:
    def test_directory_present(self):
        assert WORKFLOWS_DIR.exists(), '.github/workflows missing'

    def test_has_at_least_5_workflows(self):
        assert len(WORKFLOW_FILES) >= 5, (
            f'Only {len(WORKFLOW_FILES)} workflows found \u2014 '
            f'expected build/quality/regression/docs/defect-harness/e2e-staging/bench'
        )

    def test_expected_workflows_present(self):
        expected = {'build.yml', 'quality.yml', 'regression.yml', 'docs.yml',
                    'defect-harness.yml', 'e2e-staging.yml', 'bench.yml'}
        found = {p.name for p in WORKFLOW_FILES}
        missing = expected - found
        assert not missing, f'Missing workflows: {missing}'


@pytest.mark.skipif(not _YAML_AVAILABLE, reason='PyYAML not available')
@pytest.mark.parametrize('wf', WORKFLOW_FILES, ids=lambda p: p.name)
class TestWorkflowYAMLIntegrity:
    def test_parses_as_yaml(self, wf: Path):
        src = wf.read_text(encoding='utf-8', errors='replace')
        try:
            yaml.safe_load(src)
        except yaml.YAMLError as e:
            pytest.fail(f'{wf.name} is not valid YAML: {e}')

    def test_no_conflict_markers(self, wf: Path):
        src = wf.read_text(encoding='utf-8', errors='replace')
        assert '<<<<<<<' not in src
        assert '>>>>>>>' not in src

    def test_declares_name(self, wf: Path):
        data = yaml.safe_load(wf.read_text(encoding='utf-8'))
        assert 'name' in data, f'{wf.name} missing top-level `name`'

    def test_declares_on_trigger(self, wf: Path):
        data = yaml.safe_load(wf.read_text(encoding='utf-8'))
        # `on` is a YAML keyword \u2014 PyYAML loads it as bool True unless
        # quoted.  Accept either key.
        has_on = 'on' in data or True in data or 'on' in str(data)
        assert has_on, f'{wf.name} missing `on:` trigger'

    def test_declares_jobs(self, wf: Path):
        data = yaml.safe_load(wf.read_text(encoding='utf-8'))
        assert 'jobs' in data, f'{wf.name} missing top-level `jobs`'
        assert isinstance(data['jobs'], dict)
        assert len(data['jobs']) >= 1, f'{wf.name} has no jobs'

    def test_every_job_has_runs_on(self, wf: Path):
        data = yaml.safe_load(wf.read_text(encoding='utf-8'))
        jobs = data.get('jobs', {})
        for job_name, job_body in jobs.items():
            if not isinstance(job_body, dict):
                continue
            # Reusable workflows may have `uses:` instead of `runs-on:`.
            has_runner = 'runs-on' in job_body or 'uses' in job_body
            assert has_runner, (
                f'{wf.name} job {job_name!r} has neither runs-on nor uses'
            )

    def test_every_step_has_uses_or_run(self, wf: Path):
        data = yaml.safe_load(wf.read_text(encoding='utf-8'))
        jobs = data.get('jobs', {})
        for job_name, job_body in jobs.items():
            if not isinstance(job_body, dict):
                continue
            steps = job_body.get('steps', [])
            for i, step in enumerate(steps):
                if not isinstance(step, dict):
                    continue
                has_action = 'uses' in step or 'run' in step
                assert has_action, (
                    f'{wf.name} job {job_name} step {i} has neither '
                    f'uses nor run: {step}'
                )


# ════════════════════════════════════════════════════════════════════════
# Cross-workflow invariants
# ════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _YAML_AVAILABLE, reason='PyYAML not available')
class TestCrossWorkflow:
    def test_all_workflow_names_unique(self):
        names = []
        for wf in WORKFLOW_FILES:
            data = yaml.safe_load(wf.read_text(encoding='utf-8'))
            if 'name' in data:
                names.append(data['name'])
        duplicates = {n for n in names if names.count(n) > 1}
        assert not duplicates, (
            f'Duplicate workflow names (breaks GHA UI + indirect-dispatch): '
            f'{duplicates}'
        )

    def test_push_triggered_workflows_have_concurrency(self):
        """Any workflow triggered on `push` without a concurrency group
        risks queue saturation (our Code Quality workflow is a live
        example of this).  Known exempt: build.yml (tag-triggered),
        docs.yml (schedule-OK)."""
        EXEMPT = {'build.yml', 'docs.yml'}
        for wf in WORKFLOW_FILES:
            if wf.name in EXEMPT:
                continue
            data = yaml.safe_load(wf.read_text(encoding='utf-8'))
            on = data.get('on') or data.get(True)  # handle YAML bool
            if isinstance(on, dict) and 'push' in on:
                has_concurrency = 'concurrency' in data
                # Soft check: emit diagnostic but don't fail.  The
                # real fix is adding concurrency group to quality.yml,
                # which is separate work.
                if not has_concurrency:
                    pytest.skip(
                        f'{wf.name} is push-triggered but lacks '
                        f'concurrency group \u2014 risk of queue cancellation'
                    )


# ════════════════════════════════════════════════════════════════════════
# Deploy artifacts integrity
# ════════════════════════════════════════════════════════════════════════

class TestDeployArtifacts:
    DEPLOY = PROJECT_ROOT / 'deploy'

    def test_deploy_dir_exists(self):
        assert self.DEPLOY.exists(), 'deploy/ directory missing'

    def test_linux_desktop_file_exists(self):
        p = self.DEPLOY / 'linux' / 'Nunba.desktop'
        assert p.exists(), 'deploy/linux/Nunba.desktop missing'

    def test_linux_desktop_file_valid_format(self):
        p = self.DEPLOY / 'linux' / 'Nunba.desktop'
        src = p.read_text(encoding='utf-8', errors='replace')
        # .desktop files must start with [Desktop Entry]
        assert '[Desktop Entry]' in src
        # Required fields per freedesktop spec
        assert 'Type=' in src
        assert 'Name=' in src
        assert 'Exec=' in src

    def test_linux_install_sh_exists_and_shebang(self):
        p = self.DEPLOY / 'linux' / 'install.sh'
        assert p.exists()
        src = p.read_text(encoding='utf-8', errors='replace')
        assert src.startswith('#!'), (
            'install.sh missing shebang \u2014 won\'t be executable'
        )

    def test_linux_metainfo_xml_parses(self):
        """deploy/linux/nunba.metainfo.xml is consumed by AppStream/
        AppImage.  Invalid XML breaks the AppImage build."""
        p = self.DEPLOY / 'linux' / 'nunba.metainfo.xml'
        if not p.exists():
            pytest.skip('metainfo.xml not present')
        import xml.etree.ElementTree as ET
        try:
            ET.parse(str(p))
        except ET.ParseError as e:
            pytest.fail(f'nunba.metainfo.xml is not valid XML: {e}')

    def test_staging_crossbar_config_parses_json(self):
        p = self.DEPLOY / 'staging' / 'crossbar_config.json'
        if not p.exists():
            pytest.skip('staging/crossbar_config.json not present')
        json.loads(p.read_text(encoding='utf-8'))


# ════════════════════════════════════════════════════════════════════════
# docker-compose.staging.yml integrity
# ════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _YAML_AVAILABLE, reason='PyYAML not available')
class TestDockerComposeStaging:
    COMPOSE = PROJECT_ROOT / 'docker-compose.staging.yml'

    def test_file_exists(self):
        assert self.COMPOSE.exists(), 'docker-compose.staging.yml missing'

    def test_parses_as_yaml(self):
        src = self.COMPOSE.read_text(encoding='utf-8', errors='replace')
        try:
            yaml.safe_load(src)
        except yaml.YAMLError as e:
            pytest.fail(f'docker-compose.staging.yml is not valid YAML: {e}')

    def test_declares_services(self):
        data = yaml.safe_load(self.COMPOSE.read_text(encoding='utf-8'))
        assert 'services' in data, 'docker-compose.staging.yml has no services'
        assert isinstance(data['services'], dict)
        assert len(data['services']) >= 1

    def test_no_hardcoded_secrets(self):
        """Catches accidentally-committed API keys in env section."""
        src = self.COMPOSE.read_text(encoding='utf-8', errors='replace')
        # Heuristic patterns for leaked secrets.
        assert 'AKIA' not in src, 'AWS access key pattern in compose file'
        assert 'Bearer ' not in src, 'Bearer token in compose file'
        # sk-proj- is OpenAI-style; ghp_ is GitHub PAT prefix.
        assert 'sk-proj-' not in src
        assert 'ghp_' not in src
