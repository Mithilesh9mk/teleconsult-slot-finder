import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
import pandas as pd, numpy as np
from datetime import datetime, timedelta
import model as m
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
pd.set_option("display.width",220)
df=pd.read_csv(os.path.join(OUT, "results.csv"))
S=df[df.scenario=="Standard"]
# never-feasible lists
for sc in ["Strict","Standard","Relaxed"]:
    d=df[(df.scenario==sc)&(df.zero_days==365)]
    print(sc,"never:",len(d), "by dest:",d.destination.value_counts().to_dict())
print("Standard never list:", [(r.region,r.destination) for r in S[S.zero_days==365].itertuples()])
print("Standard partial zero:", [(r.region,r.destination,r.zero_days) for r in S[(S.zero_days>0)&(S.zero_days<365)].itertuples()])
# DST swing examples under Standard
print(S[S.seasonal_swing>0].sort_values("seasonal_swing",ascending=False)[["region","destination","min_hours","max_hours"]].head(12).to_string(index=False))
# Pairs with window >= 4h (workable) per destination in Standard
for sc in ["Strict","Standard","Relaxed"]:
    d=df[df.scenario==sc]
    print(sc,"pairs mean>=4h:",(d.mean_hours>=4).sum(),"of",len(d), "| mean<1h:",(d.mean_hours<1).sum())
# Sensitivity: widen India team end hour 18..24 with Standard other windows, effect on never-feasible count & mean
base=m.SCENARIOS["Standard"]
dates=[datetime(2026,1,15),datetime(2026,7,15)]  # winter & summer sample for speed
rows=[]
for end in [18,20,21,22,23]:
    win={**base,"india":(9,end)}
    nz=0;tot=0;n=0
    for rn,rz in m.REGIONS.items():
        for dn,dz in m.DESTINATIONS.items():
            h=np.mean([m.day_feasible_hours(d,rz,dz,win) for d in dates])
            tot+=h;n+=1;nz+= (h==0)
    rows.append((end,nz,round(tot/n,2)))
print("India end-hour sensitivity (Jan+Jul sample): end,never,mean",rows)
# Seasonal figure: weekly series for 4 illustrative pairs, Standard
dd=[datetime(2026,1,1)+timedelta(days=i) for i in range(0,365,7)]
pairs=[("UK","Turkey"),("US Eastern","Turkey"),("Australia NSW/VIC","Turkey"),("Europe Central","Thailand")]
fig,ax=plt.subplots(figsize=(8,3.6))
for r,dn in pairs:
    y=[m.day_feasible_hours(d,m.REGIONS[r],m.DESTINATIONS[dn],base) for d in dd]
    ax.step(dd,y,where="mid",label=f"{r} → {dn}")
ax.set_ylabel("Feasible hours/day"); ax.set_xlabel("2026"); ax.legend(fontsize=7); ax.grid(alpha=.3)
ax.set_title("Seasonal movement of the feasible window (Standard hours)",fontsize=10)
fig.savefig(os.path.join(OUT, "fig_seasonal.png"),dpi=400,bbox_inches="tight")
