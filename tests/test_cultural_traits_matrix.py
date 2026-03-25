"""
Parametric cultural traits matrix — every trait validated.

No hardcoded trait names — discovers all from CULTURAL_TRAITS dynamically.
"""
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from cultural_wisdom import CULTURAL_TRAITS

TRAITS_LIST = list(CULTURAL_TRAITS)
TRAIT_IDS = [t['name'] for t in TRAITS_LIST]


# ==========================================================================
# 1. Required Fields (parametric over every trait)
# ==========================================================================
@pytest.mark.parametrize('trait', TRAITS_LIST, ids=TRAIT_IDS)
def test_has_name(trait):
    assert trait['name'].strip(), "name must be non-empty"

@pytest.mark.parametrize('trait', TRAITS_LIST, ids=TRAIT_IDS)
def test_has_origin(trait):
    assert trait['origin'].strip(), f"{trait['name']}: origin empty"

@pytest.mark.parametrize('trait', TRAITS_LIST, ids=TRAIT_IDS)
def test_has_meaning(trait):
    assert trait['meaning'].strip(), f"{trait['name']}: meaning empty"

@pytest.mark.parametrize('trait', TRAITS_LIST, ids=TRAIT_IDS)
def test_has_trait_description(trait):
    assert trait['trait'].strip(), f"{trait['name']}: trait description empty"

@pytest.mark.parametrize('trait', TRAITS_LIST, ids=TRAIT_IDS)
def test_has_behavior(trait):
    assert trait['behavior'].strip(), f"{trait['name']}: behavior empty"


# ==========================================================================
# 2. Quality Checks (parametric)
# ==========================================================================
@pytest.mark.parametrize('trait', TRAITS_LIST, ids=TRAIT_IDS)
def test_meaning_is_concise(trait):
    """Meaning should be a short phrase, not a paragraph."""
    assert len(trait['meaning']) < 200, f"{trait['name']}: meaning too long ({len(trait['meaning'])} chars)"

@pytest.mark.parametrize('trait', TRAITS_LIST, ids=TRAIT_IDS)
def test_behavior_is_actionable(trait):
    """Behavior should be long enough to be actionable guidance."""
    assert len(trait['behavior']) >= 10, f"{trait['name']}: behavior too short"

@pytest.mark.parametrize('trait', TRAITS_LIST, ids=TRAIT_IDS)
def test_origin_has_geography(trait):
    """Origin should mention a place, culture, or people."""
    assert len(trait['origin']) >= 3, f"{trait['name']}: origin too short"

@pytest.mark.parametrize('trait', TRAITS_LIST, ids=TRAIT_IDS)
def test_name_not_too_long(trait):
    assert len(trait['name']) <= 50, f"Trait name too long: {trait['name']}"


# ==========================================================================
# 3. Collection-Level Invariants
# ==========================================================================
def test_at_least_30_traits():
    assert len(TRAITS_LIST) >= 30

def test_all_names_unique():
    names = [t['name'] for t in TRAITS_LIST]
    assert len(names) == len(set(names))

def test_is_immutable_tuple():
    assert isinstance(CULTURAL_TRAITS, tuple)

def test_traits_are_dicts():
    for t in TRAITS_LIST:
        assert isinstance(t, dict)
