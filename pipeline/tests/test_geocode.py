import pytest

from pci.geocode import GeocodeError, lookup, mean_centre, place_key


def test_place_keys():
    assert place_key({"commune": "Arles-sur-Tech", "department": "66"}) == (
        "commune:66:arles sur tech"
    )
    assert place_key({"commune": "Saint-Pierre-d’Albigny", "department": "73"}) == (
        "commune:73:saint pierre d'albigny"
    )
    assert place_key({"insee": "66136"}) == "insee:66136"
    assert place_key({"department": "973"}) == "department:973"
    assert place_key({"region": "93"}) == "region:93"
    with pytest.raises(GeocodeError):
        place_key({"label": "nowhere"})


def test_mean_centre():
    communes = [
        {"centre": {"coordinates": [2.0, 42.0]}},
        {"centre": {"coordinates": [4.0, 44.0]}},
        {"nom": "no centre"},
    ]
    assert mean_centre(communes) == (43.0, 3.0)


def test_lookup_uses_cache_only_and_keeps_label_override():
    cache = {
        "region:93": {
            "label": "Provence-Alpes-Côte d'Azur",
            "lat": 1,
            "lon": 2,
            "precision": "region",
        }
    }
    assert lookup({"region": "93", "label": "Provence"}, cache)["label"] == "Provence"
    with pytest.raises(GeocodeError, match="pci geocode"):
        lookup({"region": "11"}, cache)
