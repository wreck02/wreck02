# road-fatigue

Synthesise an **ISO 8608** road profile from its PSD with random phases, drive a
linear **two-degree-of-freedom quarter car** over it with SciPy, and
**rainflow-count** the resulting wheel-load history (ASTM E1049-85).

```
ISO 8608 PSD  --random phases-->  road profile z(x)
                                       |  speed v  (t = x / v)
                                       v
                        quarter car  [z_s, z_u, z_s', z_u']   (scipy.signal.lsim or solve_ivp)
                                       |
                                       v
                        wheel load F(t) = (m_s + m_u) g + k_t (z_r - z_u) + c_t (z_r' - z_u')
                                       |
                                       v
                        rainflow cycles (range, mean, count) -> histogram, range-mean matrix,
                                                               pseudo-damage, equivalent range
```

## Install and run

```sh
cd road_fatigue
pip install -e ".[test]"     # numpy, scipy, matplotlib (+ pytest and the `rainflow` package for cross-checks)
pytest                       # 40 tests, ~10 s

road-fatigue                                    # class F, 2000 m, 10 m/s, seed 0 - prints a summary
road-fatigue --road-class F --speed 10 --length 2000 --dx 0.05 --seed 0 --out results
python -m road_fatigue --help                   # every option, including vehicle parameters
```

With `--out DIR` the run writes `summary.json`, `road_profile.csv`,
`wheel_load.csv`, `rainflow_cycles.csv` and three figures (`road_profile.png`,
`wheel_load.png`, `rainflow.png`).

## Library use

```python
from road_fatigue import synthesize_profile, simulate, count_cycles, QuarterCarParams
from road_fatigue.rainflow import bin_ranges, equivalent_range

road = synthesize_profile(length=2000.0, dx=0.05, road_class="F", seed=0)
car = QuarterCarParams(m_s=290, m_u=59, k_s=16812, c_s=1000, k_t=190_000)
resp = simulate(road, speed=10.0, params=car, solver="lsim")   # or solver="ivp"
cycles = count_cycles(resp.wheel_load)

edges, counts = bin_ranges(cycles, bins=32)
print(equivalent_range(cycles, exponent=3.0))
```

or in one call:

```python
from road_fatigue import run_analysis, save_outputs
result = run_analysis(road_class="F", speed=10.0, length=2000.0, dx=0.05, seed=0)
print(result.summary["rainflow"])
save_outputs(result, "results")
```

## What each stage does

### `iso8608.py` - PSD and profile synthesis

ISO 8608 models the displacement PSD as `G_d(n) = G_d(n0) (n/n0)^-w` with
`n0 = 0.1 cycles/m` and `w = 2`. Classes A-H are factor-of-four bands in
`G_d(n0)`; the geometric mean of the band represents the class:

| class | A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|---|
| `G_d(n0)` ×10⁻⁶ m³ | 16 | 64 | 256 | 1024 | 4096 | **16384** | 65536 | 262144 |

`synthesize_profile` builds the profile on a uniform grid: every rFFT bin in the
ISO band `0.011 <= n <= 2.83 cycles/m` gets a cosine of amplitude
`sqrt(2 G_d(n) dn)` and a phase drawn uniformly from `[0, 2π)`, and an inverse
FFT sums them. Because amplitudes are fixed and only phases are random, the
sample variance of every realisation equals the discrete band integral of the
PSD exactly (this is tested). `RoadProfile.psd_welch` and `fitted_gd_n0`
estimate the PSD back from the samples and re-classify it.

Class F is a very poor road (unpaved track). Its RMS elevation over the ISO band
is about 0.12 m, most of it at wavelengths of tens of metres. Keep the length
well above `1/n_min ≈ 91 m` so those wavelengths are represented; the default is
2000 m.

### `quartercar.py` - 2-DOF model

State `[z_s, z_u, z_s', z_u']`, input `[z_r, z_r']`:

```
m_s z_s'' = -k_s (z_s - z_u) - c_s (z_s' - z_u')
m_u z_u'' =  k_s (z_s - z_u) + c_s (z_s' - z_u') - k_t (z_u - z_r) - c_t (z_u' - z_r')
```

Defaults are a mid-size passenger car (`m_s = 290 kg`, `m_u = 59 kg`,
`k_s = 16 812 N/m`, `c_s = 1000 N s/m`, `k_t = 190 kN/m`, `c_t = 0`), giving a
body-bounce mode near 1.2 Hz and wheel hop near 9.5 Hz.

The road is converted to a time series with `dt = dx / v`. `solver="lsim"`
(default) uses `scipy.signal.lsim`, which discretises the linear system exactly
with linearly interpolated input; `solver="ivp"` integrates the same ODEs with
`scipy.integrate.solve_ivp` (RK45, `max_step = dt`) as an independent check.
`QuarterCarParams.frequency_response` returns the analytic transfer functions,
and the tests confirm that the simulated steady-state amplitude on a sinusoidal
road matches them.

The model is linear, so the tyre can pull on the road. `liftoff_fraction`
reports how often the total wheel load goes negative; on class F at 10 m/s this
is not negligible, and the rainflow result should be read with that in mind (a
contact-loss model would clip those loads at zero).

### `rainflow.py` - ASTM E1049-85 counting

`count_cycles` reduces the history to reversals, then applies the ASTM
three-point stack rule: a range `Y` is closed as a full cycle when the following
range `X >= Y`, as a half cycle if it still contains the starting point, and all
residue ranges are closed as half cycles at the end. Each `Cycle` carries its
range, mean, count and the sample indices of its two reversals. Helpers give
range histograms, a range-mean matrix, Miner/Basquin pseudo-damage
`Σ n_i S_i^m` and the equivalent constant-amplitude range. The implementation
is checked against the ASTM worked example and, when installed, against the
`rainflow` PyPI package on random signals.

## Layout

```
road_fatigue/
  road_fatigue/
    iso8608.py     PSD, classes, synthesis
    quartercar.py  parameters, state space, simulate()
    rainflow.py    reversals, count_cycles(), binning, damage helpers
    pipeline.py    run_analysis(), summarize(), save_outputs(), figures
    cli.py         argparse front end
  tests/           pytest suite
  pyproject.toml
```
