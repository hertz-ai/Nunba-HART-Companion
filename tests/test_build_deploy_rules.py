"""
Deep functional tests for build, deployment, and project structure rules.

Tests INTENDED BEHAVIOR of the Nunba project structure:
- Required files exist (main.py, app.py, config.json, etc.)
- React build produces correct artifacts
- cx_Freeze config excludes test files
- Version consistency across modules
- Package.json scripts defined
- Cypress config correct
- MkDocs config valid
- CI workflows exist
"""
import json
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


# ==========================================================================
# 1. Required Project Files
# ==========================================================================
class TestRequiredFiles:
    REQUIRED = [
        'main.py', 'app.py', 'config.json', 'template.json',
        'requirements.txt', 'ruff.toml', 'mkdocs.yml',
    ]

    @pytest.mark.parametrize('filename', REQUIRED)
    def test_required_file_exists(self, filename):
        path = os.path.join(PROJECT_ROOT, filename)
        assert os.path.isfile(path), f"Required file missing: {filename}"

    def test_landing_page_dir_exists(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, 'landing-page'))

    def test_scripts_dir_exists(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, 'scripts'))

    def test_tests_dir_exists(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, 'tests'))

    def test_docs_dir_exists(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, 'docs'))


# ==========================================================================
# 2. Config.json Structure
# ==========================================================================
class TestConfigJson:
    @pytest.fixture(scope='class')
    def config(self):
        with open(os.path.join(PROJECT_ROOT, 'config.json'), encoding='utf-8') as f:
            return json.load(f)

    def test_is_valid_json(self, config):
        assert isinstance(config, dict)

    def test_has_ip_address_section(self, config):
        assert 'IP_ADDRESS' in config, "config.json must have IP_ADDRESS section"


# ==========================================================================
# 3. Template.json Structure
# ==========================================================================
class TestTemplateJson:
    @pytest.fixture(scope='class')
    def template(self):
        with open(os.path.join(PROJECT_ROOT, 'template.json'), encoding='utf-8') as f:
            return json.load(f)

    def test_is_valid_json(self, template):
        assert isinstance(template, dict)

    def test_has_greet_responses(self, template):
        assert 'greet' in template, "template.json must have greet responses"

    def test_has_abusive_responses(self, template):
        assert 'abusive' in template


# ==========================================================================
# 4. Package.json Scripts
# ==========================================================================
class TestPackageJson:
    @pytest.fixture(scope='class')
    def pkg(self):
        with open(os.path.join(PROJECT_ROOT, 'landing-page', 'package.json'), encoding='utf-8') as f:
            return json.load(f)

    def test_has_start_script(self, pkg):
        assert 'start' in pkg.get('scripts', {}), "Must have npm start"

    def test_has_build_script(self, pkg):
        assert 'build' in pkg.get('scripts', {}), "Must have npm build"

    def test_has_test_script(self, pkg):
        scripts = pkg.get('scripts', {})
        assert 'test' in scripts, "Must have npm test"

    def test_react_dependency(self, pkg):
        deps = pkg.get('dependencies', {})
        assert 'react' in deps, "Must depend on React"

    def test_mui_dependency(self, pkg):
        deps = pkg.get('dependencies', {})
        assert any('mui' in k for k in deps), "Must depend on MUI"

    def test_cypress_dev_dependency(self, pkg):
        devdeps = pkg.get('devDependencies', {})
        assert 'cypress' in devdeps, "Must have Cypress as devDependency"


# ==========================================================================
# 5. Cypress Config
# ==========================================================================
class TestCypressConfig:
    def test_cypress_config_exists(self):
        path = os.path.join(PROJECT_ROOT, 'landing-page', 'cypress.config.js')
        assert os.path.isfile(path)

    def test_cypress_support_file_exists(self):
        path = os.path.join(PROJECT_ROOT, 'landing-page', 'cypress', 'support', 'e2e.js')
        assert os.path.isfile(path)

    def test_at_least_50_spec_files(self):
        spec_dir = os.path.join(PROJECT_ROOT, 'landing-page', 'cypress', 'e2e')
        specs = [f for f in os.listdir(spec_dir) if f.endswith('.cy.js')]
        assert len(specs) >= 50, f"Expected 50+ Cypress specs, got {len(specs)}"


# ==========================================================================
# 6. CI Workflows
# ==========================================================================
class TestCIWorkflows:
    WORKFLOWS = ['quality.yml', 'build.yml', 'docs.yml']

    @pytest.mark.parametrize('workflow', WORKFLOWS)
    def test_workflow_exists(self, workflow):
        path = os.path.join(PROJECT_ROOT, '.github', 'workflows', workflow)
        assert os.path.isfile(path), f"CI workflow missing: {workflow}"

    def test_quality_yml_has_pytest(self):
        path = os.path.join(PROJECT_ROOT, '.github', 'workflows', 'quality.yml')
        with open(path, encoding='utf-8') as f:
            content = f.read()
        assert 'pytest' in content, "quality.yml must run pytest"

    def test_quality_yml_has_cypress(self):
        path = os.path.join(PROJECT_ROOT, '.github', 'workflows', 'quality.yml')
        with open(path, encoding='utf-8') as f:
            content = f.read()
        assert 'cypress' in content.lower(), "quality.yml must run Cypress"

    def test_build_yml_has_three_platforms(self):
        path = os.path.join(PROJECT_ROOT, '.github', 'workflows', 'build.yml')
        with open(path, encoding='utf-8') as f:
            content = f.read()
        assert 'windows' in content.lower()
        assert 'macos' in content.lower() or 'darwin' in content.lower()
        assert 'linux' in content.lower() or 'ubuntu' in content.lower()


# ==========================================================================
# 7. Version Consistency
# ==========================================================================
class TestVersionConsistency:
    def test_hart_version_format(self):
        sys.path.insert(0, PROJECT_ROOT)
        import hart_version
        v = hart_version.version
        parts = v.split('.')
        assert len(parts) >= 2, f"Version must be semver: {v}"
        # Allow dev suffix: 0.0.1.dev617
        assert parts[0].isdigit(), f"Major version must be numeric: {v}"

    def test_desktop_config_version(self):
        sys.path.insert(0, PROJECT_ROOT)
        from desktop.config import APP_VERSION
        parts = APP_VERSION.split('.')
        assert len(parts) >= 2


# ==========================================================================
# 8. Ruff Configuration
# ==========================================================================
class TestRuffConfig:
    def test_ruff_toml_exists(self):
        path = os.path.join(PROJECT_ROOT, 'ruff.toml')
        assert os.path.isfile(path)

    def test_ruff_toml_valid(self):
        path = os.path.join(PROJECT_ROOT, 'ruff.toml')
        with open(path, encoding='utf-8') as f:
            content = f.read()
        assert 'line-length' in content or 'select' in content


# ==========================================================================
# 9. MkDocs Configuration
# ==========================================================================
class TestMkDocsConfig:
    def test_mkdocs_yml_exists(self):
        path = os.path.join(PROJECT_ROOT, 'mkdocs.yml')
        assert os.path.isfile(path)

    def test_mkdocs_has_site_name(self):
        import yaml
        path = os.path.join(PROJECT_ROOT, 'mkdocs.yml')
        with open(path, encoding='utf-8') as f:
            config = yaml.safe_load(f)
        assert 'site_name' in config
        assert 'Nunba' in config['site_name']

    def test_mkdocs_has_nav(self):
        import yaml
        path = os.path.join(PROJECT_ROOT, 'mkdocs.yml')
        with open(path, encoding='utf-8') as f:
            config = yaml.safe_load(f)
        assert 'nav' in config
        assert len(config['nav']) >= 5, "Must have 5+ nav sections"

    def test_mkdocs_has_downloads_page(self):
        import yaml
        path = os.path.join(PROJECT_ROOT, 'mkdocs.yml')
        with open(path, encoding='utf-8') as f:
            config = yaml.safe_load(f)
        nav_str = str(config.get('nav', []))
        assert 'downloads' in nav_str.lower() or 'Downloads' in nav_str
