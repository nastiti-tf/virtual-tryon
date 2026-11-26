from PIL import Image, ImageDraw
import numpy as np, cv2, glob, json, os

SRC='/mnt/user-data/uploads/'
# id: (file, shoulderL, shoulderR, hemY)  koordinat di gambar asli (px)
M={
 'jumat_panjang':('Jumat-Panjang',(150,240),(745,240),1110),
 'jumat_pendek': ('Jumat-Pendek', (150,240),(745,240),1110),
 'kamis_panjang':('Kamis-Panjang',(160,250),(735,250),1105),
 'kamis_pendek': ('Kamis-Pendek', (165,250),(735,250),1105),
 'selasa_panjang':('Selasa-Panjang',(155,268),(735,268),1090),
 'selasa_pendek':('Selasa-Pendek',(155,272),(735,272),1090),
 'senin_blazer':('Senin',(170,185),(775,185),1105),
 'rabu_panjang':('Rabu-Panjang',(58,60),(185,60),312),
 'rabu_pendek': ('Rabu-Pendek',(52,60),(190,60),312),
}
out={}
os.makedirs('final',exist_ok=True); os.makedirs('marked',exist_ok=True)
for id_,(name,sl,sr,hem) in M.items():
    f=glob.glob(SRC+name+'.*')[0]
    im=np.array(Image.open(f).convert('RGB'))
    near=(im.min(axis=2)>=244).astype(np.uint8)
    pad=cv2.copyMakeBorder(near,1,1,1,1,cv2.BORDER_CONSTANT,value=1)
    _,lab=cv2.connectedComponents(pad,connectivity=4)
    bg=(lab==lab[0,0])[1:-1,1:-1]
    fg=(~bg).astype(np.uint8)
    if name.startswith('Rabu'):
        fg=(im.min(axis=2)<190).astype(np.uint8)
    n2,lab2,st,_=cv2.connectedComponentsWithStats(fg,connectivity=8)
    big=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); fg=(lab2==big).astype(np.uint8)
    if not name.startswith('Rabu'): fg=cv2.morphologyEx(fg,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
    if not name.startswith('Rabu'):
        inv=1-fg; pi=cv2.copyMakeBorder(inv,1,1,1,1,cv2.BORDER_CONSTANT,value=1)
        _,l=cv2.connectedComponents(pi,connectivity=4); outside=(l==l[0,0])[1:-1,1:-1]
        fg=(~outside).astype(np.uint8)
    fg=cv2.erode(fg,np.ones((3,3),np.uint8))          # buang halo putih di tepi
    a=cv2.GaussianBlur(fg.astype(np.float32),(0,0),0.9)
    a=np.clip((a-0.5)*1.8+0.5,0,1)
    ys,xs=np.where(a>0.04); x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
    small = im.shape[1]<400
    scale = 3 if small else 1
    rgba=np.dstack([im,(a*255).astype(np.uint8)])[y0:y1,x0:x1]
    img=Image.fromarray(rgba,'RGBA')
    if scale>1:
        img=img.resize((img.width*scale,img.height*scale),Image.LANCZOS)
    elif img.width>760:
        k=760/img.width; img=img.resize((760,round(img.height*k)),Image.LANCZOS); scale=k
    else: scale=1
    W,H=img.size
    def fx(x): return (x-x0)*scale/W
    def fy(y): return (y-y0)*scale/H
    img.save(f'final/{id_}.webp',quality=90,method=6)
    out[id_]=dict(size=[W,H],
        shoulderL=[round(fx(sl[0]),4),round(fy(sl[1]),4)],
        shoulderR=[round(fx(sr[0]),4),round(fy(sr[1]),4)],
        hem=round(fy(hem),4))
    # penanda untuk pengecekan
    prev=Image.new('RGBA',(W,H),(60,60,90,255)); prev.alpha_composite(img)
    d=ImageDraw.Draw(prev)
    for (px,py) in (sl,sr):
        X,Y=fx(px)*W,fy(py)*H; d.ellipse((X-6,Y-6,X+6,Y+6),outline=(0,255,0,255),width=3)
    d.line((0,fy(hem)*H,W,fy(hem)*H),fill=(255,255,0,255),width=2)
    prev.convert('RGB').resize((W*500//H,500)).save(f'marked/{id_}.png')
json.dump(out,open('geometry.json','w'),indent=1)
print(json.dumps(out,indent=1))
