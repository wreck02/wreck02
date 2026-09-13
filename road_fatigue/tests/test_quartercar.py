import numpy as np
import pytest

from road_fatigue.iso8608 import synthesize_profile
from road_fatigue.quartercar import OUTPUT_NAMES, QuarterCarParams, simulate


def test_default_natural_frequencies_are_typical_car_values():
    f_body, f_hop = QuarterCarParams().natural_frequencies()
    assert 1.0 < f_body < 1.5
    assert 8.0 < f_hop < 11.0


def test_state_space_shapes_and_static_load():
    p = QuarterCarParams()
    A, B, C, D = p.state_space()
    assert A.shape == (4, 4) and B.shape == (4, 2)
    assert C.shape == (len(OUTPUT_NAMES), 4) and D.shape == (len(OUTPUT_NAMES), 2)
    assert p.static_wheel_load == pytest.approx((290 + 59) * 9.80665)
    # A is stable
    assert np.all(np.linalg.eigvals(A).real < 0)


def test_parameter_validation():
    with pytest.raises(ValueError):
        QuarterCarParams(m_s=0)
    with pytest.raises(ValueError):
        QuarterCarParams(c_s=-1)


def test_step_input_settles_with_zero_dynamic_tyre_force():
    dt_road = 0.01
    z_r = np.concatenate([np.zeros(50), np.full(2950, 0.02)])
    r = simulate(z_r, speed=1.0, dx=dt_road)  # dt = 0.01 s, 30 s total
    assert r.z_s[-1] == pytest.approx(0.02, abs=1e-5)
    assert r.z_u[-1] == pytest.approx(0.02, abs=1e-5)
    assert abs(r.tyre_force_dynamic[-1]) < 1.0
    assert r.wheel_load[-1] == pytest.approx(r.params.static_wheel_load, abs=1.0)
    assert r.dt == pytest.approx(0.01)
    assert r.x[-1] == pytest.approx(2999 * dt_road)


@pytest.mark.parametrize("f_hz", [0.7, 1.2, 4.0, 9.5, 20.0])
def test_sinusoid_steady_state_matches_frequency_response(f_hz):
    p = QuarterCarParams(c_t=50.0)  # non-zero tyre damping exercises the velocity input
    fs = 500.0
    t = np.arange(0, 40.0, 1.0 / fs)
    amp = 0.005
    z_r = amp * np.sin(2 * np.pi * f_hz * t)
    r = simulate(z_r, speed=1.0, dx=1.0 / fs, params=p)
    H = p.frequency_response(f_hz)
    tail = t > 30.0  # transients gone (body mode damping ratio ~0.23)
    for name in OUTPUT_NAMES:
        y = getattr(r, name)[tail]
        measured = 0.5 * (y.max() - y.min())
        expected = amp * abs(H[name][0])
        assert measured == pytest.approx(expected, rel=2e-2), name


def test_frequency_response_limits():
    p = QuarterCarParams()
    H0 = p.frequency_response(1e-4)
    # at DC the wheel follows the road: no tyre force, no travel, no deflection
    assert abs(H0["tyre_force_dynamic"][0]) < 1e-3 * p.k_t
    assert abs(H0["suspension_travel"][0]) < 1e-6
    assert abs(H0["tyre_deflection"][0]) < 1e-6
    # resonance peak of tyre force sits near wheel hop
    f = np.linspace(0.2, 30, 3000)
    mag = np.abs(p.frequency_response(f)["tyre_force_dynamic"])
    f_hop = p.natural_frequencies()[1]
    assert abs(f[np.argmax(mag)] - f_hop) < 1.5


def test_lsim_and_ivp_agree_on_random_road():
    prof = synthesize_profile(length=200.0, dx=0.05, road_class="D", seed=11)
    a = simulate(prof, speed=15.0, solver="lsim")
    b = simulate(prof, speed=15.0, solver="ivp", rtol=1e-8, atol=1e-11)
    scale = np.sqrt(np.mean(a.tyre_force_dynamic**2))
    assert np.max(np.abs(a.tyre_force_dynamic - b.tyre_force_dynamic)) < 0.02 * scale
    assert np.max(np.abs(a.z_s - b.z_s)) < 0.02 * np.std(a.z_s)
    assert a.solver == "lsim" and b.solver == "ivp"


def test_response_helpers():
    prof = synthesize_profile(length=300.0, dx=0.05, road_class="F", seed=2)
    r = simulate(prof, speed=10.0)
    assert np.array_equal(r.wheel_load, r.tyre_force_dynamic + r.params.static_wheel_load)
    assert 0.0 <= r.liftoff_fraction <= 1.0
    assert r.dynamic_load_coefficient > 0
    assert r.t.size == prof.z.size


def test_bad_arguments():
    with pytest.raises(ValueError):
        simulate(np.zeros(10), speed=10.0)  # dx missing
    with pytest.raises(ValueError):
        simulate(np.zeros(10), speed=0.0, dx=0.1)
    with pytest.raises(ValueError):
        simulate(np.zeros(10), speed=1.0, dx=0.1, solver="euler")
