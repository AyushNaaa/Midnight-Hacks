"""Training script for the Behavioral Mesh GAT (§2C.2).

Cosine LR, checkpoints every 10 epochs, recall + FPR metrics. CUDA/MPS/CPU.

Usage:
    python scripts/generate_mesh_data.py   # generate data first
    python scripts/train_gat.py
"""
import torch, torch.nn as nn, torch.optim as optim, sys, os
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch_geometric.loader import DataLoader

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server")))
from detection.models.gat import BehavioralMeshGAT

CLASSES = ["wallhack", "collab"]

def _dev():
    if torch.cuda.is_available(): return torch.device("cuda")
    if hasattr(torch.backends,"mps") and torch.backends.mps.is_available(): return torch.device("mps")
    return torch.device("cpu")

def _eval(model, ldr, d):
    model.eval(); tp=torch.zeros(2); fp=torch.zeros(2); fn=torch.zeros(2); tn=torch.zeros(2)
    with torch.no_grad():
        for b in ldr:
            b=b.to(d); o=model(b.x,b.edge_index,b.edge_attr,b.batch); pb=(o>0.5).float(); y=b.y
            for c in range(2):
                p=y[:,c]==1; n=y[:,c]==0
                tp[c]+=(pb[:,c][p]==1).sum().item(); fn[c]+=(pb[:,c][p]==0).sum().item()
                fp[c]+=(pb[:,c][n]==1).sum().item(); tn[c]+=(pb[:,c][n]==0).sum().item()
    r={}
    for c in range(2):
        rec=tp[c].item()/(tp[c].item()+fn[c].item()) if tp[c]+fn[c]>0 else 0
        fpr=fp[c].item()/(fp[c].item()+tn[c].item()) if fp[c]+tn[c]>0 else 0
        r[CLASSES[c]]={"recall":rec,"fpr":fpr}
    return r

def train(path="data/synthetic_gat.pt", epochs=50, bs=32):
    ds=torch.load(path,weights_only=False)
    ldr=DataLoader(ds,batch_size=bs,shuffle=True)
    d=_dev(); print(f"Device: {d}")
    model=BehavioralMeshGAT(node_features=12,edge_features=4,hidden_channels=32,heads=4,out_classes=2).to(d)
    print(f"Params: {sum(p.numel() for p in model.parameters()):,}")
    crit=nn.BCELoss(); opt=optim.AdamW(model.parameters(),lr=1e-3,weight_decay=1e-4)
    sch=CosineAnnealingLR(opt,T_max=epochs,eta_min=1e-5)
    wd="server/detection/models/weights"; os.makedirs(wd,exist_ok=True)
    for ep in range(epochs):
        model.train(); tl=0
        for b in ldr:
            b=b.to(d); opt.zero_grad()
            o=model(b.x,b.edge_index,b.edge_attr,b.batch); loss=crit(o,b.y)
            loss.backward(); nn.utils.clip_grad_norm_(model.parameters(),1.0); opt.step()
            tl+=loss.item()
        sch.step(); n=len(ldr)
        print(f"Epoch {ep+1:>3}/{epochs} | loss {tl/n:.4f} | lr {sch.get_last_lr()[0]:.6f}")
        if (ep+1)%10==0:
            fp=os.path.join(wd,f"gat_epoch{ep+1}.pt"); torch.save(model.state_dict(),fp)
            r=_eval(model,ldr,d)
            print(f"  ckpt {fp}  "+"  ".join(f"{k}: rec={v['recall']:.0%} fpr={v['fpr']:.0%}" for k,v in r.items()))
    fp=os.path.join(wd,"gat_v1.pt"); torch.save(model.state_dict(),fp)
    r=_eval(model,ldr,d); print(f"\nFinal -> {fp}")
    for k,v in r.items(): print(f"  {k}: recall={v['recall']:.1%}  FPR={v['fpr']:.1%}")

if __name__=="__main__": train()
