"""Linear two-degree-of-freedom quarter-car model.

State vector ``x = [z_s, z_u, z_s', z_u']`` (sprung and unsprung displacement
and velocity, positive upwards, measured from the static equilibrium).  Input
``u = [z_r, z_r']`` is the road displacement and its rate.

    m_s z_s'' = -k_s (z_s - z_u) - c_s (z_s' - z_u')
    m_u z_u'' =  k_s (z_s - z_u) + c_s (z_s' - z_u') - k_t (z_u - z_r) - c_t (z_u' - z_r')

The dynamic tyre force ``F_t = k_t (z_r - z_u) + c_t (z_r' - z_u')`` is positive
in compression; the total wheel load is ``F_t + (m_s + m_u) g``.  The model is
linear, so the tyre can pull as well as push: a negative total wheel load means
the real tyre would have left the road.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.integrate import solve_ivp
from scipy.signal import lsim

from .iso8608 import RoadProfile

OUTPUT_NAMES = ("tyre_force_dynamic", "sprung_accel", "suspension_travel", "tyre_deflection")


@dataclass(frozen=True)
class QuarterCarParams:
    """Quarter-car parameters (defaults: a mid-size passenger car).

    m_s : sprung mass, kg
    m_u : unsprung mass, kg
    k_s : suspension stiffness, N/m
    c_s : suspension damping, N s/m
    k_t : tyre radial stiffness, N/m
    c_t : tyre damping, N s/m
    g   : gravitational acceleration, m/s^2
    """

    m_s: float = 290.0
    m_u: float = 59.0
    k_s: float = 16_812.0
    c_s: float = 1_000.0
    k_t: float = 190_000.0
    c_t: float = 0.0
    g: float = 9.80665

    def __post_init__(self) -> None:
        for name in ("m_s", "m_u", "k_s", "k_t"):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} must be positive")
        for name in ("c_s", "c_t"):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} must be non-negative")

    @property
    def static_wheel_load(self) -> float:
        """Static tyre load ``(m_s + m_u) g`` in N."""
        return (self.m_s + self.m_u) * self.g

    def state_space(self) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Return ``(A, B, C, D)`` with outputs ordered as ``OUTPUT_NAMES``."""
        ms, mu, ks, cs, kt, ct = self.m_s, self.m_u, self.k_s, self.c_s, self.k_t, self.c_t
        A = np.array(
            [
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
                [-ks / ms, ks / ms, -cs / ms, cs / ms],
                [ks / mu, -(ks + kt) / mu, cs / mu, -(cs + ct) / mu],
            ]
        )
        B = np.array(
            [
                [0.0, 0.0],
                [0.0, 0.0],
                [0.0, 0.0],
                [kt / mu, ct / mu],
            ]
        )
        C = np.array(
            [
                [0.0, -kt, 0.0, -ct],  # dynamic tyre force
                [-ks / ms, ks / ms, -cs / ms, cs / ms],  # sprung-mass acceleration
                [1.0, -1.0, 0.0, 0.0],  # suspension travel z_s - z_u
                [0.0, 1.0, 0.0, 0.0],  # tyre deflection z_u - z_r
            ]
        )
        D = np.array(
            [
                [kt, ct],
                [0.0, 0.0],
                [0.0, 0.0],
                [-1.0, 0.0],
            ]
        )
        return A, B, C, D

    def natural_frequencies(self) -> np.ndarray:
        """Undamped natural frequencies in Hz, ascending (body bounce, wheel hop)."""
        M = np.diag([self.m_s, self.m_u])
        K = np.array([[self.k_s, -self.k_s], [-self.k_s, self.k_s + self.k_t]])
        omega_sq = np.linalg.eigvals(np.linalg.solve(M, K)).real
        return np.sort(np.sqrt(omega_sq)) / (2.0 * np.pi)

    def frequency_response(self, f) -> dict[str, np.ndarray]:
        """Complex frequency response of every output to unit road displacement.

        ``f`` is in Hz.  Because ``z_r' = i*omega*z_r`` the two-input system
        collapses to a single-input one for a harmonic road.
        """
        f = np.atleast_1d(np.asarray(f, dtype=float))
        omega = 2.0 * np.pi * f
        A, B, C, D = self.state_space()
        u = np.stack([np.ones_like(omega), 1j * omega], axis=-1)  # (nf, 2)
        s = 1j * omega
        resolvent = s[:, None, None] * np.eye(4) - A  # (nf, 4, 4)
        rhs = (B @ u.T).T[:, :, None]  # (nf, 4, 1)
        x = np.linalg.solve(resolvent, rhs)[:, :, 0]  # (nf, 4)
        y = x @ C.T + u @ D.T  # (nf, 4)
        return {name: y[:, i] for i, name in enumerate(OUTPUT_NAMES)}


@dataclass
class QuarterCarResponse:
    """Time histories produced by :func:`simulate`.

    All displacements in m, velocities in m/s, accelerations in m/s^2 and forces
    in N.  ``wheel_load`` is the total (static + dynamic) tyre load, positive in
    compression.
    """

    t: np.ndarray
    x: np.ndarray
    z_r: np.ndarray
    z_s: np.ndarray
    z_u: np.ndarray
    v_s: np.ndarray
    v_u: np.ndarray
    tyre_force_dynamic: np.ndarray
    sprung_accel: np.ndarray
    suspension_travel: np.ndarray
    tyre_deflection: np.ndarray
    speed: float
    params: QuarterCarParams = field(default_factory=QuarterCarParams)
    solver: str = "lsim"

    @property
    def dt(self) -> float:
        return float(self.t[1] - self.t[0])

    @property
    def wheel_load(self) -> np.ndarray:
        return self.tyre_force_dynamic + self.params.static_wheel_load

    @property
    def liftoff_fraction(self) -> float:
        """Fraction of samples in which the linear model predicts tensile tyre load."""
        return float(np.mean(self.wheel_load < 0.0))

    @property
    def dynamic_load_coefficient(self) -> float:
        """RMS dynamic tyre force divided by the static load."""
        return float(np.sqrt(np.mean(self.tyre_force_dynamic**2)) / self.params.static_wheel_load)


def _road_input(profile, speed: float, dx: float | None):
    if isinstance(profile, RoadProfile):
        z_r = np.asarray(profile.z, dtype=float)
        dx = profile.dx
    else:
        if dx is None:
            raise ValueError("dx is required when the road is given as a plain array")
        z_r = np.asarray(profile, dtype=float)
    if speed <= 0:
        raise ValueError("speed must be positive")
    if z_r.ndim != 1 or z_r.size < 2:
        raise ValueError("road profile must be a 1-D array with at least two samples")
    dt = dx / speed
    t = np.arange(z_r.size) * dt
    return z_r, dx, dt, t


def simulate(
    profile,
    speed: float,
    params: QuarterCarParams | None = None,
    *,
    dx: float | None = None,
    solver: str = "lsim",
    rtol: float = 1e-6,
    atol: float = 1e-9,
    x0=None,
) -> QuarterCarResponse:
    """Drive the quarter car over a road profile at constant speed.

    Parameters
    ----------
    profile : RoadProfile or array_like
        Road displacement samples (uniform spacing).  Pass ``dx`` for a plain array.
    speed : float
        Forward speed, m/s.  Sets the time step ``dt = dx / speed``.
    params : QuarterCarParams, optional
        Vehicle parameters; defaults to :class:`QuarterCarParams`.
    solver : {"lsim", "ivp"}
        ``"lsim"`` uses :func:`scipy.signal.lsim` (linear-interpolated input, exact
        discretisation; fast and the default).  ``"ivp"`` integrates the ODEs with
        :func:`scipy.integrate.solve_ivp` (RK45) and is provided as an
        independent check.
    rtol, atol : float
        Tolerances for the ``"ivp"`` solver.
    x0 : array_like, optional
        Initial state ``[z_s, z_u, z_s', z_u']``; zero (static equilibrium) by default.
    """
    params = params or QuarterCarParams()
    z_r, dx, dt, t = _road_input(profile, speed, dx)
    v_r = np.gradient(z_r, dt)
    u = np.column_stack([z_r, v_r])
    A, B, C, D = params.state_space()
    x0 = np.zeros(4) if x0 is None else np.asarray(x0, dtype=float)

    if solver == "lsim":
        _, y, x = lsim((A, B, C, D), U=u, T=t, X0=x0, interp=True)
    elif solver == "ivp":

        def rhs(tau, state):
            u_tau = np.array([np.interp(tau, t, z_r), np.interp(tau, t, v_r)])
            return A @ state + B @ u_tau

        sol = solve_ivp(
            rhs,
            (t[0], t[-1]),
            x0,
            t_eval=t,
            method="RK45",
            max_step=dt,
            rtol=rtol,
            atol=atol,
        )
        if not sol.success:
            raise RuntimeError(f"solve_ivp failed: {sol.message}")
        x = sol.y.T
        y = x @ C.T + u @ D.T
    else:
        raise ValueError("solver must be 'lsim' or 'ivp'")

    return QuarterCarResponse(
        t=t,
        x=t * speed,
        z_r=z_r,
        z_s=x[:, 0],
        z_u=x[:, 1],
        v_s=x[:, 2],
        v_u=x[:, 3],
        tyre_force_dynamic=y[:, 0],
        sprung_accel=y[:, 1],
        suspension_travel=y[:, 2],
        tyre_deflection=y[:, 3],
        speed=float(speed),
        params=params,
        solver=solver,
    )
