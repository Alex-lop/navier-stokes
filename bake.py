"""Bakes can.bin: this site's own solution of the flow in steps 7 and 8 of the guide.

    python3 bake.py          solve (about 20 minutes on a laptop) and write can.bin beside this file
    python3 bake.py check    compare can.bin with the table Luo and Hou published

It solves the 3D axisymmetric Euler equations in the setting of Luo and Hou, on a fixed grid squeezed geometrically toward
the corner (r, z) = (1, 0), which is the ring where the solution blows up.

Variables (Luo & Hou 2014, arXiv:1310.0497, eq. 2.2): u1 = u_theta / r, w1 = omega_theta / r, p1 = psi_theta / r.
  u1_t + ur u1_r + uz u1_z = 2 u1 p1_z
  w1_t + ur w1_r + uz w1_z = (u1^2)_z
  -(d_rr + (3/r) d_r + d_zz) p1 = w1,   ur = -r p1_z,   uz = 2 p1 + r p1_r
Domain r in [0, 1], z in [0, L/4]. u1 is odd in z at z = 0 and even at z = L/4; w1 and p1 are odd at both.
All three are even in r at r = 0, and p1 = 0 on the wall r = 1.
"""
import numpy as np
from scipy.linalg import eigh

L = 1 / 6


def stretch(q, beta, flat=False):
    """G(q) = int_0^q cosh(k phi(q')) dq' with k = 2 beta / pi. Grid nodes sit at G(q) / G(1) for uniform q, so the
    spacing is finest at q = 0 and grows geometrically away from it. phi = sin(pi q / 2), or sin^2(pi q / 2) when flat,
    which keeps the first cells uniform. Either way G' is even about q = 0 and about q = 1, so mirroring a grid
    function about an end of the grid keeps it smooth."""
    k = 2 * beta / np.pi
    phi = (lambda x: np.sin(np.pi * x / 2) ** 2) if flat else (lambda x: np.sin(np.pi * x / 2))
    x, w = np.polynomial.legendre.leggauss(40)
    q = np.atleast_1d(np.asarray(q, float))
    edges = np.linspace(0, 1, 65)[:, None, None]             # [0, q] in 64 panels of 40-point Gauss
    a, b = edges[:-1] * q[None, None, :], edges[1:] * q[None, None, :]
    xs = (a + b) / 2 + (b - a) / 2 * x[None, :, None]
    return np.sum((b - a) / 2 * w[None, :, None] * np.cosh(k * phi(xs)), axis=(0, 1))


# Undivided differences along an axis of an array padded with two ghost entries at each end.
def _s(ax, a, b): return tuple([slice(None)] * ax + [slice(a, b)])
def d4(F, ax):                                               # fourth order, centred
    return (F[_s(ax, 0, -4)] - 8 * F[_s(ax, 1, -3)] + 8 * F[_s(ax, 3, -1)] - F[_s(ax, 4, None)]) / 12
def dm(F, ax):                                               # third order, biased to lower indices: for velocity > 0
    return (F[_s(ax, 0, -4)] - 6 * F[_s(ax, 1, -3)] + 3 * F[_s(ax, 2, -2)] + 2 * F[_s(ax, 3, -1)]) / 6
def dp(F, ax):                                               # third order, biased to higher indices: for velocity < 0
    return (-2 * F[_s(ax, 1, -3)] - 3 * F[_s(ax, 2, -2)] + 6 * F[_s(ax, 3, -1)] - F[_s(ax, 4, None)]) / 6


class Grid:
    def __init__(self, nr, nz, beta_r, beta_z):
        self.nr, self.nz = nr, nz
        hr, hz = 1 / (nr - 0.5), 1 / nz
        gr, gz = stretch(1, beta_r, True)[0], stretch(1, beta_z)[0]
        rmap = lambda xi: 1 - stretch(1 - xi, beta_r, True) / gr     # uniform cells at the wall, where the stencils are one-sided
        zmap = lambda eta: (L / 4) * stretch(eta, beta_z) / gz
        self.r = rmap((np.arange(nr) + 0.5) * hr)            # the last node is the wall, the first is half a cell off the axis
        self.r[-1] = 1.0
        self.z = zmap(np.arange(nz + 1) * hz)                # z = 0 ... L/4
        self.z[0] = 0.0
        self.R, self.Z = self.r[:, None], self.z[None, :]
        # Metric terms come from the same stencils as the derivatives they divide, so a function linear in r or z is
        # differentiated exactly. With the analytic r'(xi) the error would be about 1e-6 and change from row to row;
        # divided by a cell 1e-9 wide, that is a false gradient of thousands.
        rp = self._padr(self.R, -1)
        zp = np.concatenate([-self.z[2:0:-1], self.z, L / 2 - self.z[-2:-4:-1]])[None, :]
        self.Dr = [self._wall(f(rp, 0), self.R) for f in (d4, dm, dp)]
        self.Dz = [f(zp, 1) for f in (d4, dm, dp)]
        self.cell_r, self.cell_z = self.Dr[0], self.Dz[0]    # grid spacing per index, for the time step
        # ---- Poisson: finite volumes, then both directions diagonalised.
        # r: (1 / r^3) d_r (r^3 d_r p), unknowns i = 0 .. nr-2 (the wall value is 0; no flux through the axis, where r^3 = 0)
        rh = np.concatenate([[0.0], rmap(np.arange(1, nr) * hr)])       # faces i - 1/2, i = 0 .. nr-1
        c = rh[1:] ** 3 / np.diff(self.r)                               # flux coefficient through face i + 1/2
        d = self.r[:-1] ** 3 * np.diff(rh)
        self.cr, self.dr_w = c[:, None], d[:, None]
        S = np.diag(-c - np.concatenate([[0.0], c[:-1]])) + np.diag(c[:-1], 1) + np.diag(c[:-1], -1)
        self.lam_r, self.Vr, self.Vr_inv = self._eig(S, d)
        # z: d_zz p, unknowns j = 1 .. nz-1 (p1 is odd at both ends, so 0 there)
        zh = zmap((np.arange(nz) + 0.5) * hz)                           # faces j + 1/2
        c = 1 / np.diff(self.z)
        d = np.diff(zh)
        self.cz, self.dz_w = c[None, :], d[None, :]
        S = np.diag(-c[:-1] - c[1:]) + np.diag(c[1:-1], 1) + np.diag(c[1:-1], -1)
        self.lam_z, self.Vz, self.Vz_inv = self._eig(S, d)
        self.denom = self.lam_r[:, None] + self.lam_z[None, :]

    @staticmethod
    def _eig(S, d):
        """Eigenvectors of diag(1/d) S, through the symmetric matrix D^-1/2 S D^-1/2."""
        lam, W = eigh(S / np.sqrt(d[:, None] * d[None, :]))
        V, V_inv = W / np.sqrt(d)[:, None], W.T * np.sqrt(d)[None, :]
        V[np.abs(V) < 1e-100] = 0; V_inv[np.abs(V_inv) < 1e-100] = 0    # underflow to subnormals is slow
        return lam, V, V_inv

    def laplace(self, p):
        """The discrete (d_rr + (3/r) d_r + d_zz) p at the unknowns, straight from the fluxes."""
        out = np.zeros_like(p)
        f = self.cr * (p[1:] - p[:-1])
        out[:-1] = f
        out[1:-1] -= f[:-1]
        out[:-1] /= self.dr_w
        f = self.cz * (p[:, 1:] - p[:, :-1])
        out[:, 1:-1] += (f[:, 1:] - f[:, :-1]) / self.dz_w
        out[-1] = 0; out[:, 0] = 0; out[:, -1] = 0
        return out

    def poisson(self, w1, refine=1):
        """Solve -(d_rr + (3/r) d_r + d_zz) p1 = w1. On a grid this stretched the eigenvectors carry rounding error
        near 1e-6, so the residual is solved for once more."""
        p, rhs = np.zeros_like(w1), w1
        for _ in range(1 + refine):
            hat = self.Vr_inv @ -rhs[:-1, 1:-1] @ self.Vz_inv.T
            p[:-1, 1:-1] += self.Vr @ (hat / self.denom) @ self.Vz.T
            rhs = w1 + self.laplace(p)
        return p

    # ---- derivatives. In z the parity at z = 0 is p0 and at z = L/4 is p1: +1 even, -1 odd. In r, even at the axis.
    def _padz(self, f, p0, p1):
        return np.concatenate([p0 * f[:, 2:0:-1], f, p1 * f[:, -2:-4:-1]], axis=1)

    def _padr(self, f, parity=1):
        return np.concatenate([parity * f[1::-1], f], axis=0)

    @staticmethod
    def _wall(d, f):
        """Append the two rows by the wall, where the stencil has to be one-sided (fourth order)."""
        a = (3 * f[-1] + 10 * f[-2] - 18 * f[-3] + 6 * f[-4] - f[-5]) / 12
        b = (25 * f[-1] - 48 * f[-2] + 36 * f[-3] - 16 * f[-4] + 3 * f[-5]) / 12
        return np.concatenate([d, a[None], b[None]], axis=0)

    def dz(self, f, p0, p1):
        return d4(self._padz(f, p0, p1), 1) / self.Dz[0]

    def dr(self, f):
        return self._wall(d4(self._padr(f), 0), f) / self.Dr[0]

    def dz_up(self, f, p0, p1, vel):
        F = self._padz(f, p0, p1)
        return np.where(vel > 0, dm(F, 1) / self.Dz[1], dp(F, 1) / self.Dz[2])

    def dr_up(self, f, vel):
        F = self._padr(f)
        return np.where(vel > 0, self._wall(dm(F, 0), f) / self.Dr[1], self._wall(dp(F, 0), f) / self.Dr[2])


def velocity(g, w1):
    p = g.poisson(w1)
    pz = g.dz(p, -1, -1)
    return p, pz, -g.R * pz, 2 * p + g.R * g.dr(p)


def rhs(g, u1, w1):
    p, pz, ur, uz = velocity(g, w1)
    du = -ur * g.dr_up(u1, ur) - uz * g.dz_up(u1, -1, 1, uz) + 2 * u1 * pz
    dw = -ur * g.dr_up(w1, ur) - uz * g.dz_up(w1, -1, -1, uz) + 2 * u1 * g.dz(u1, -1, 1)
    cfl_rate = np.max(np.abs(ur / g.cell_r) + np.abs(uz / g.cell_z))
    strain = max(np.max(np.abs(g.dz(uz, -1, -1))), 2 * np.max(np.abs(pz)))       # how fast gradients can grow
    return du, dw, max(cfl_rate / 0.5, strain / 0.02, 1e-300)                    # CFL 0.5, and at most about 2% growth a step


def vorticity(g, u1, w1):
    """|omega| with omega = (-r u1_z, r w1, 2 u1 + r u1_r) in (r, theta, z): Luo & Hou, eq. 4.5a."""
    return np.sqrt((g.R * g.dz(u1, -1, 1)) ** 2 + (g.R * w1) ** 2 + (2 * u1 + g.R * g.dr(u1)) ** 2)


def initial(g):
    u1 = 100 * np.exp(-30 * (1 - g.R ** 2) ** 4) * np.sin(2 * np.pi * g.Z / L)
    return u1, np.zeros_like(u1)


def run(g, t_end, dt_max=1e-6, on_step=None, t_marks=()):
    """Classical RK4 from the Luo-Hou initial data to t_end, landing exactly on each time in t_marks."""
    u1, w1 = initial(g)
    t, n, marks, out = 0.0, 0, sorted(t_marks), []
    while t < t_end - 1e-15:
        k1u, k1w, rate = rhs(g, u1, w1)
        dt = min(1 / rate, dt_max, t_end - t)
        if marks and t + dt >= marks[0] - 1e-15:
            dt = marks[0] - t
        k2u, k2w, _ = rhs(g, u1 + dt / 2 * k1u, w1 + dt / 2 * k1w)
        k3u, k3w, _ = rhs(g, u1 + dt / 2 * k2u, w1 + dt / 2 * k2w)
        k4u, k4w, _ = rhs(g, u1 + dt * k3u, w1 + dt * k3w)
        u1 = u1 + dt / 6 * (k1u + 2 * k2u + 2 * k3u + k4u)
        w1 = w1 + dt / 6 * (k1w + 2 * k2w + 2 * k3w + k4w)
        t += dt; n += 1
        if not np.isfinite(u1).all():
            raise FloatingPointError(f'not finite at step {n}, t = {t}')
        if marks and abs(t - marks[0]) < 1e-15:
            marks.pop(0)
            out.append((t, u1.copy(), w1.copy()))
        if on_step: on_step(n, t, dt, u1, w1)
    return u1, w1, out


# ---- the run -------------------------------------------------------------------------------------------
# Luo and Hou, arXiv:1310.0497: the largest vorticity on their 2048 x 2048 mesh (table 4.2.2), and their estimate of the
# blow-up time. The run stops at T_END: past it this grid no longer resolves the solution.
PUBLISHED = {0.003: 9.0847e4, 0.0034: 4.3127e6, 0.0035: 5.8413e9}
T_BLOW, T_END = 0.0035056, 0.0035


def solve(n=512, beta=26.0):
    """Returns the grid, snapshots (t, u1, w1) taken each time the largest vorticity has grown by 10^(1/8), and (t, max) at every step."""
    g = Grid(n, n, beta, beta)
    snaps, hist, state = [], [], {'next': 0.0, 'last': -1.0}

    def on_step(_, t, dt, u1, w1):
        om = vorticity(g, u1, w1).max()
        hist.append((t, om))
        if np.log10(om) >= state['next'] or t - state['last'] >= 2.5e-4 or t >= T_END - 1e-15:
            snaps.append((t, u1.copy(), w1.copy()))
            state['next'], state['last'] = np.log10(om) + 1 / 8, t
            print(f'  t = {t:.7f}, dt = {dt:.1e}, max|omega| = {om:.5e}', flush=True)

    u1, w1 = initial(g)
    on_step(0, 0.0, 0.0, u1, w1)
    run(g, T_END, on_step=on_step, t_marks=sorted(PUBLISHED))
    return g, snaps, np.array(hist)


# ---- can.bin ----------------------------------------------------------------------------------------------
# Little-endian. Eight uint32: the magic number 'CAN1', then ns snapshots, a wide grid of wr x wz nodes, a window of mr x mz
# nodes, nh history points, and a zero. Then float32 arrays: the wide grid's distances from the wall (wr) and heights (wz);
# for each snapshot its time, its largest vorticity and the window's unit lz (ns each); and the history as (time, largest
# vorticity) pairs. Then for each snapshot, as bytes, row by row with the height varying fastest:
#   wide grid:  log10 |omega| from 2 (byte 0) up to that snapshot's largest (255);  u1 from 0 to 100
#   window:     log10 |omega| from 1.5 decades below that snapshot's largest (0) up to it (255);  then u_r and u_z, each as
#               128 + 127 * (its value / the window's largest speed)
# The window spans 40 lz from the wall and 12 lz up from the plane z = 0, on a uniform grid. lz is the height at which the
# vorticity on the wall has fallen to half its value at the corner, so the window shrinks with the collapse.
WIDE_R, WIDE_Z, WIN_R, WIN_Z, WIN_SPAN_R, WIN_SPAN_Z = 48, 40, 96, 48, 40, 12


def export(g, snaps, hist, path):
    from scipy.interpolate import RegularGridInterpolator
    d = 1 - g.r[::-1]                                         # distance from the wall, increasing
    d[0] = 0.0
    wide_d = np.concatenate([[0.0], np.geomspace(2e-4, d[-1], WIDE_R - 1)])
    wide_z = np.concatenate([[0.0], np.geomspace(2e-5, L / 4, WIDE_Z - 1)])
    byte = lambda a: np.clip(np.rint(a), 0, 255).astype(np.uint8)
    times, tops, units, blobs = [], [], [], []
    for t, u1, w1 in snaps:
        om = vorticity(g, u1, w1)
        _, _, ur, uz = velocity(g, w1)
        at = lambda a, dd, zz: RegularGridInterpolator((d, g.z), a[::-1], bounds_error=False, fill_value=None)(np.stack(np.meshgrid(dd, zz, indexing='ij'), -1))
        top = np.log10(om.max())
        ridge = om[-1]                                        # along the wall, where omega = |u1_z|
        k = np.argmax(ridge < ridge[0] / 2)
        lz = np.interp(ridge[0] / 2, [ridge[k], ridge[k - 1]], [g.z[k], g.z[k - 1]])
        # the window, folded back into the quarter-layer the solver works in: the flow repeats every L/2, mirrored about every L/4
        dd, zz = np.linspace(0, WIN_SPAN_R * lz, WIN_R), np.linspace(0, WIN_SPAN_Z * lz, WIN_Z)
        f = (zz / (L / 2)) % 1
        zq, flip = np.where(f <= 0.5, f, 1 - f) * (L / 2), np.where(f <= 0.5, 1.0, -1.0)[None, :]
        inside = (dd <= d[-1])[:, None]                       # past the axis there is nothing to show
        dq = np.minimum(dd, d[-1])
        w_om = np.where(inside, np.log10(at(om, dq, zq)), 0.0)
        w_ur, w_uz = np.where(inside, at(ur, dq, zq), 0.0), np.where(inside, at(uz, dq, zq) * flip, 0.0)
        fastest = max(np.hypot(w_ur, w_uz).max(), 1e-300)     # the starting flow is pure swirl: nothing moves in the slice yet
        blobs += [byte(255 * (np.log10(at(om, wide_d, wide_z)) - 2) / (top - 2)), byte(255 * at(u1, wide_d, wide_z) / 100),
                  byte(255 * (1 - (top - w_om) / 1.5)), byte(128 + 127 * w_ur / fastest), byte(128 + 127 * w_uz / fastest)]
        times.append(t); tops.append(om.max()); units.append(lz)
    keep = [0]                                                # thin the history: a point for each 1% of growth, or each 2e-5 of time
    for i in range(1, len(hist)):
        if hist[i, 1] > 1.01 * hist[keep[-1], 1] or hist[i, 0] - hist[keep[-1], 0] >= 2e-5 or i == len(hist) - 1:
            keep.append(i)
    h = hist[keep]
    f32 = lambda a: np.asarray(a, '<f4').tobytes()
    with open(path, 'wb') as out:
        out.write(np.array([0x314E4143, len(snaps), WIDE_R, WIDE_Z, WIN_R, WIN_Z, len(h), 0], '<u4').tobytes())
        out.write(f32(wide_d) + f32(wide_z) + f32(times) + f32(tops) + f32(units) + f32(h))
        out.write(b''.join(b.tobytes() for b in blobs))
    return len(snaps), len(h)


def read_history(path):
    with open(path, 'rb') as f:
        buf = f.read()
    magic, ns, wr, wz, mr, mz, nh, _ = np.frombuffer(buf, '<u4', 8)
    assert magic == 0x314E4143, 'not a can.bin'
    assert len(buf) == 32 + 4 * (wr + wz + 3 * ns + 2 * nh) + ns * (2 * wr * wz + 3 * mr * mz), 'can.bin has the wrong length'
    return np.frombuffer(buf, '<f4', 2 * nh, 32 + 4 * (wr + wz + 3 * ns)).reshape(-1, 2).astype(float), ns


def check(path):
    """True if the baked largest vorticity agrees with the published table: to 0.5% at the first two times and 10% at the last."""
    h, ns = read_history(path)
    ok = abs(h[0, 1] / (1200 * np.pi) - 1) < 1e-4             # the starting flow's largest vorticity is exactly 100 * 2 pi / L
    print(f'{ns} snapshots, {len(h)} history points, t from {h[0, 0]} to {h[-1, 0]:.6f}')
    print(f't = 0:      max|omega| = {h[0, 1]:.5e}, exact {1200 * np.pi:.5e}')
    for (t, ref), tol in zip(sorted(PUBLISHED.items()), (0.005, 0.005, 0.1)):
        mine = np.exp(np.interp(t, h[:, 0], np.log(h[:, 1])))
        ok &= abs(mine / ref - 1) < tol
        print(f't = {t}: max|omega| = {mine:.5e}, published {ref:.5e}, {100 * (mine / ref - 1):+.2f}% (allowed {100 * tol:g}%)')
    print('agrees with the published table' if ok else 'DOES NOT agree with the published table')
    return ok


if __name__ == '__main__':
    import os, sys
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'can.bin')
    if sys.argv[1:] == ['check']:
        sys.exit(0 if check(here) else 1)
    g, snaps, hist = solve()
    print('wrote %d snapshots and %d history points' % export(g, snaps, hist, here))
    sys.exit(0 if check(here) else 1)
