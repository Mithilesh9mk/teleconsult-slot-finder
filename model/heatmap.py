import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

df = pd.read_csv(os.path.join(OUT, "results.csv"))
fig, axes = plt.subplots(1, 3, figsize=(15, 8), sharey=True)
regions = list(dict.fromkeys(df.region))
dests = list(dict.fromkeys(df.destination))
vmax = df.mean_hours.max()
for ax, sc in zip(axes, ["Strict", "Standard", "Relaxed"]):
    p = df[df.scenario == sc].pivot(index="region", columns="destination", values="mean_hours").loc[regions, dests]
    im = ax.imshow(p.values, cmap="viridis", vmin=0, vmax=vmax, aspect="auto")
    ax.set_xticks(range(len(dests)), dests, rotation=30, ha="right")
    ax.set_title(f"{sc} hours")
    for i in range(p.shape[0]):
        for j in range(p.shape[1]):
            v = p.values[i, j]
            ax.text(j, i, f"{v:.1f}", ha="center", va="center", fontsize=7,
                    color="white" if v < vmax * 0.6 else "black")
axes[0].set_yticks(range(len(regions)), regions)
fig.colorbar(im, ax=axes, shrink=0.6, label="Mean feasible hours per day, 2026")
fig.suptitle("Three-party feasible teleconsultation window (patient, India team, clinic)")
fig.savefig(os.path.join(OUT, "fig_heatmap.png"), dpi=200, bbox_inches="tight")
