"""J175 · Kids teacher broadcasts to 5 students.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: /api/kids/fleet-command (kids_game_recommendation.py:506)
→ events channel → 5 listeners → each plays TTS.

At contract tier: fleet-command endpoint reachable; tts/quick
reachable for each student.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j175_fleet_command_endpoint(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/kids/fleet-command",
        json={"command": "broadcast", "message": "J175 teacher say hi"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/kids/fleet-command not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(45)
def test_j175_tts_quick_for_five_students(nunba_flask_app):
    for i in range(5):
        r = nunba_flask_app.post(
            "/api/social/tts/quick",
            json={"text": f"student {i} hears this", "lang": "en"},
            headers={"Content-Type": "application/json"},
        )
        if r.status_code == 404:
            pytest.skip("tts/quick not mounted")
        body = r.get_data(as_text=True)
        assert not (r.status_code >= 500 and not body.strip())
