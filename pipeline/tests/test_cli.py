import pytest

from pci.cli import main


def test_requires_a_command():
    with pytest.raises(SystemExit):
        main([])
