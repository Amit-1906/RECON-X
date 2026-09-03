"""
Unit tests for DeviceManager and hardware acceleration detection.
"""
from backend.app.core.device import DeviceManager, device_manager


def test_device_manager_initialization():
    caps = device_manager.capabilities
    assert caps.device_type in ("cuda", "cpu")
    assert caps.cpu_cores_logical >= 1
    assert caps.ram_total_gb > 0.0


def test_device_resolution():
    # If CPU requested, should resolve to cpu
    assert device_manager.resolve_device("cpu") == "cpu"

    # Auto resolution should match capability
    expected = "cuda" if device_manager.capabilities.cuda_available else "cpu"
    assert device_manager.resolve_device("auto") == expected


def test_torch_device_instantiation():
    torch_dev = device_manager.get_torch_device("cpu")
    assert torch_dev.type == "cpu"
