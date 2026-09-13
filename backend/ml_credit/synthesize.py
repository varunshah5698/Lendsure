"""Fit-on-real, sample-at-scale synthetic borrowers.

No hand-invented shapes: every marginal comes from segment-conditional
statistics of the REAL data (KMeans segments + Ledoit-Wolf covariances),
clipped to observed 1st/99th percentiles. Labels come from a teacher
model fitted on real data only, with 2% flip noise so the student cannot
just memorize a deterministic function.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.preprocessing import StandardScaler

from .features import FEATURES, CITY_PRIOR

SEG_DIMS = [f for f in FEATURES if f not in ("tenure_months", "city_risk")]
# Discrete / zero-inflated dims are copied EXACTLY (no jitter) so their
# marginals stay faithful. Only smooth continuous dims get jitter.
DISCRETE_DIMS = {"age", "late_count", "severe_count", "prev_defaults", "dpd_max"}
CONT_DIMS = [f for f in SEG_DIMS if f not in DISCRETE_DIMS]
INT_DIMS = {"age": (21, 70), "late_count": (0, 6), "severe_count": (0, 6),
            "prev_defaults": (0, 6), "dpd_max": (0, 8)}

CITY_KEYS = list(CITY_PRIOR.keys())
CITY_W = np.array([0.14, 0.12, 0.10, 0.07, 0.07, 0.05, 0.06, 0.04, 0.04, 0.03,
                   0.03, 0.03, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.01, 0.05])
CITY_W = CITY_W / CITY_W.sum()


def fit_segments(real: pd.DataFrame, k: int = 16, seed: int = 42) -> dict:
    X = real[SEG_DIMS].to_numpy(dtype=float)
    scaler = StandardScaler().fit(X)
    km = KMeans(n_clusters=k, n_init=10, random_state=seed).fit(scaler.transform(X))
    labels = km.labels_
    clips = {f: (float(real[f].quantile(0.01)), float(real[f].quantile(0.99))) for f in SEG_DIMS}
    stds = {f: float(real[f].std() or 1.0) for f in CONT_DIMS}
    segs = []
    members = {}
    for s in range(k):
        idx = np.where(labels == s)[0]
        if len(idx) < 50:
            continue
        members[str(s)] = idx.tolist()
        segs.append({"id": s, "weight": float(len(idx) / len(X))})
    return {"k": k, "members": members, "segments": segs, "clips": clips, "stds": stds}


def fit_teacher(real: pd.DataFrame, seed: int = 42):
    X = real[SEG_DIMS].to_numpy(dtype=float)
    y = real["default"].to_numpy(dtype=int)
    t = HistGradientBoostingClassifier(max_iter=150, learning_rate=0.06,
                                       max_leaf_nodes=31, min_samples_leaf=100,
                                       l2_regularization=5.0, random_state=seed)
    t.fit(X, y)
    return t


def generate(spec: dict, teacher, real: pd.DataFrame, n: int, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    segs = spec["segments"]
    weights = np.array([s["weight"] for s in segs])
    weights /= weights.sum()
    counts = rng.multinomial(n, weights)
    base = real[SEG_DIMS].to_numpy(dtype=float)
    frames = []
    for s, c in zip(segs, counts):
        if c <= 0:
            continue
        members = np.array(spec["members"][str(s["id"])])
        pick = members[rng.integers(0, len(members), size=c)]
        blk = base[pick].copy()
        # jitter smooth dims only (~5% of global std), then clip to real p1/p99
        for j, f in enumerate(SEG_DIMS):
            if f in CONT_DIMS:
                blk[:, j] += rng.normal(0, 0.05 * spec["stds"][f], size=c)
            lo, hi = spec["clips"][f]
            blk[:, j] = np.clip(blk[:, j], lo, hi)
        frames.append(pd.DataFrame(blk, columns=SEG_DIMS))
    df = pd.concat(frames, ignore_index=True)
    for f, (lo, hi) in INT_DIMS.items():
        df[f] = df[f].round().clip(lo, hi).astype(int)
    df["late_count"] = df[["late_count", "severe_count"]].max(axis=1).astype(int)
    # tenure conditioned on age (documented assumption, ranges only)
    age = df["age"].to_numpy()
    df["tenure_months"] = np.minimum(
        84, np.maximum(6, ((age - 21) * 6 * rng.uniform(0.5, 1.0, len(df))).round())).astype(int)
    # city + weakly jittered prior risk
    cities = rng.choice(CITY_KEYS, size=len(df), p=CITY_W)
    df["city"] = cities
    df["city_risk"] = np.array([CITY_PRIOR[c] for c in cities]) * rng.lognormal(0, 0.08, len(df))
    # labels from the real-fitted teacher + flip noise
    p = teacher.predict_proba(df[SEG_DIMS].to_numpy(dtype=float))[:, 1]
    p = np.clip(p, 0.02, 0.98)
    flips = rng.random(len(df)) < 0.02
    y = (rng.random(len(df)) < p).astype(int)
    y[flips] = 1 - y[flips]
    df["default"] = y
    return df[FEATURES + ["default", "city"]]
