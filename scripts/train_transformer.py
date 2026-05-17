"""Training script for the Behavioral Transformer (§2C.2).

Cosine LR, checkpoints every 10 epochs, per-class recall. CUDA/MPS/CPU.

Usage:
    python scripts/generate_cheat_data.py   # generate data first
    python scripts/train_transformer.py
"""
import torch, torch.nn as nn, torch.optim as optim, sys, os
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import TensorDataset, DataLoader

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server")))
from detection.models.transformer import BehavioralTransformer

CLASSES = ["aim", "reaction", "macro", "speed", "tracking"]

def _dev():
    if torch.cuda.is_available(): return torch.device("cuda")
    if hasattr(torch.backends,"mps") and torch.backends.mps.is_available(): return torch.device("mps")
    return torch.device("cpu")

def _eval(model, ldr, d):
    model.eval(); tp=torch.zeros(5); fn=torch.zeros(5); ok=tot=0
    with torch.no_grad():
        for bx,by,_ in ldr:
            bx,by=bx.to(d),by.to(d); _,p=model(bx); pb=(p>0.5).float()
            ok+=(pb==by).all(1).sum().item(); tot+=by.size(0)
            for c in range(5):
                m=by[:,c]==1; tp[c]+=(pb[:,c][m]==1).sum().item(); fn[c]+=(pb[:,c][m]==0).sum().item()
    acc=ok/tot if tot else 0
    rec={CLASSES[c]:tp[c].item()/(tp[c].item()+fn[c].item()) if tp[c]+fn[c]>0 else 0 for c in range(5)}
    return acc,rec

def train(path="data/synthetic_transformer.pt", epochs=50, bs=32):
    data=torch.load(path,weights_only=False)
    ldr=DataLoader(TensorDataset(data["X"],data["Y_class"],data["Y_next"]),batch_size=bs,shuffle=True)
    d=_dev(); print(f"Device: {d}")
    model=BehavioralTransformer(input_dim=9,d_model=64,n_heads=4,n_layers=6).to(d)
    print(f"Params: {sum(p.numel() for p in model.parameters()):,}")
    cc=nn.BCELoss(); cs=nn.MSELoss()
    opt=optim.AdamW(model.parameters(),lr=1e-3,weight_decay=1e-4)
    sch=CosineAnnealingLR(opt,T_max=epochs,eta_min=1e-5)
    wd="server/detection/models/weights"; os.makedirs(wd,exist_ok=True)
    for ep in range(epochs):
        model.train(); tl=tc=ts=0.0
        for bx,byc,byn in ldr:
            bx,byc,byn=bx.to(d),byc.to(d),byn.to(d); opt.zero_grad()
            pn,pc=model(bx); ls=cs(pn,byn); lc=cc(pc,byc); loss=ls+lc*2
            loss.backward(); nn.utils.clip_grad_norm_(model.parameters(),1.0); opt.step()
            tl+=loss.item(); tc+=lc.item(); ts+=ls.item()
        sch.step(); n=len(ldr)
        print(f"Epoch {ep+1:>3}/{epochs} | loss {tl/n:.4f} (cls {tc/n:.4f} seq {ts/n:.4f}) | lr {sch.get_last_lr()[0]:.6f}")
        if (ep+1)%10==0:
            fp=os.path.join(wd,f"transformer_epoch{ep+1}.pt"); torch.save(model.state_dict(),fp)
            a,r=_eval(model,ldr,d)
            print(f"  ckpt {fp}  acc={a:.1%}  "+"  ".join(f"{k}={v:.0%}" for k,v in r.items()))
    fp=os.path.join(wd,"transformer_v1.pt"); torch.save(model.state_dict(),fp)
    a,r=_eval(model,ldr,d); print(f"\nFinal -> {fp}  acc={a:.1%}")
    for k,v in r.items(): print(f"  {k}: {v:.1%}")

if __name__=="__main__": train()
