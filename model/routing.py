import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
import pandas as pd
pd.set_option("display.width",200)
df=pd.read_csv(os.path.join(OUT, "results.csv")); S=df[df.scenario=="Standard"].copy()
def tier(r):
    if r.zero_days==365: return "Red (none)"
    if r.mean_hours>=4 and r.zero_days==0: return "Green"
    if r.mean_hours>=1: return "Amber"
    return "Red (<1h)"
S["tier"]=S.apply(tier,axis=1)
print(S.groupby(["destination","tier"]).size().unstack(fill_value=0))
print(S.tier.value_counts().to_dict())
best=S.loc[S.groupby("region").mean_hours.idxmax()][["region","destination","mean_hours"]]
print(best.round(2).to_string(index=False))
# regions with at least one Green destination
g=S[S.tier=="Green"].groupby("region").destination.apply(list)
print("regions with >=1 Green:",len(g),"of",S.region.nunique())
print("regions with NO Green:",sorted(set(S.region)-set(g.index)))
S.to_csv(os.path.join(OUT, "routing_matrix_standard.csv"),index=False)
