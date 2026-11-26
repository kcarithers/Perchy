import cv2, numpy as np
from PIL import Image
OUT='/home/user/perchy/src/media/'
S=0.75; CX,CY,CW,CH=100,480,880,1100          # stage crop in frame coords
HX,HY,HW,HH=400,715,370,400                    # head sprite rect
def paint(rgb):
    # painterly look: flatten fine photo texture, keep the feather pattern, lift colour a little
    y0,y1,x0,x1=650,1650,250,850; c=rgb[y0:y1,x0:x1]
    st=cv2.stylization(c,sigma_s=24,sigma_r=0.42); ep=cv2.edgePreservingFilter(c,flags=1,sigma_s=30,sigma_r=0.3)
    o=cv2.addWeighted(st,0.65,ep,0.35,0)
    hsv=cv2.cvtColor(o,cv2.COLOR_BGR2HSV).astype(np.float32); hsv[:,:,1]=np.clip(hsv[:,:,1]*1.18,0,255); hsv[:,:,2]=np.clip(hsv[:,:,2]*1.04+4,0,255)
    out=rgb.copy(); out[y0:y1,x0:x1]=cv2.cvtColor(hsv.astype(np.uint8),cv2.COLOR_HSV2BGR); return out
def load(n,dx=0,dy=0):
    rgb=cv2.imread(f'f_{n}.png'); a=np.array(Image.open(f'bird_{n}.png'))[:,:,3]
    M=np.float32([[1,0,dx],[0,1,dy]]); h,w=a.shape
    return paint(cv2.warpAffine(rgb,M,(w,h))), cv2.warpAffine(a,M,(w,h))
A,aA=load('09'); B,aB=load('02',-5,3)
yy,xx=np.mgrid[0:A.shape[0],0:A.shape[1]].astype(np.float32)
def curve(cx): return 1062-0.0075*(xx-cx)**2
def save(rgb,alpha,rect,name,q=90):
    x,y,w,h=rect; im=np.dstack([rgb[y:y+h,x:x+w,::-1],alpha[y:y+h,x:x+w]]).astype(np.uint8)
    im=Image.fromarray(im).resize((round(w*S),round(h*S)),Image.LANCZOS); im.save(OUT+name,quality=q,method=6); return im
# heads
for name,rgb,al,cx,beak in [('headA',A,aA,570,(463,893,562,996)),('headB',B,aB,593,(523,893,624,994))]:
    c=curve(cx); f=np.clip((c+38-yy)/48,0,1); f=f*f*(3-2*f)
    ha=(al*f).astype(np.uint8); save(rgb,ha,(HX,HY,HW,HH),name+'.webp')
    hsv=cv2.cvtColor(rgb,cv2.COLOR_BGR2HSV); x0,y0,x1,y1=beak
    m=((hsv[:,:,0]>=17)&(hsv[:,:,0]<=48)&(hsv[:,:,1]>70)).astype(np.uint8)*255
    box=np.zeros_like(m); box[y0:y1,x0:x1]=255; m=cv2.bitwise_and(m,box)
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8)); m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    n,lab,st,_=cv2.connectedComponentsWithStats(m); k=1+np.argmax(st[1:,4]); m=(lab==k).astype(np.uint8)*255
    m=cv2.GaussianBlur(m,(5,5),0); ys,xs=np.where(m>128); print(name,'beak bbox',xs.min(),ys.min(),xs.max(),ys.max())
    save(rgb,m,(HX,HY,HW,HH),name.replace('head','beak')+'.webp')
# feet (from pose A) are their own layer so the body can be mirrored for the turn to the other side
def feetmask(n,dx,dy,al):
    raw=cv2.imread(f'f_{n}.png'); M=np.float32([[1,0,dx],[0,1,dy]]); raw=cv2.warpAffine(raw,M,(raw.shape[1],raw.shape[0]))
    hsv=cv2.cvtColor(raw,cv2.COLOR_BGR2HSV); H,Sa,V=hsv[:,:,0],hsv[:,:,1],hsv[:,:,2]
    pale=(Sa<105)&(V>105); band=(H>=104)&(H<=125)&(Sa>120)
    m=np.zeros(al.shape,np.uint8)
    for (x0,y0,x1,y1),useband in [((340,1332,440,1535),False),((560,1372,685,1598),True)]:
        sel=pale[y0:y1,x0:x1]|((band[y0:y1,x0:x1]) if useband else False)
        if useband: sel[70:,:]&=pale[y0+70:y1,x0:x1]
        sub=(sel&(al[y0:y1,x0:x1]>20)).astype(np.uint8)*255
        sub=cv2.morphologyEx(sub,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8)); sub=cv2.morphologyEx(sub,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
        k,lab,st,_=cv2.connectedComponentsWithStats(sub); big=1+np.argmax(st[1:,4]); m[y0:y1,x0:x1]=(lab==big).astype(np.uint8)*255
    return cv2.dilate(m,np.ones((7,7),np.uint8))
for name,n,rgb,al,cx,sh in [('bodyA','09',A,aA,570,(0,0)),('bodyB','02',B,aB,593,(-5,3))]:
    fm=feetmask(n,sh[0],sh[1],al)
    if name=='bodyA':
        fa=cv2.GaussianBlur(np.minimum(fm,al),(0,0),1.2); frgb=np.clip(rgb.astype(np.float32)*np.array([0.80,0.80,0.86])+np.array([10,6,14]),0,255).astype(np.uint8); save(frgb,fa,(CX,CY,CW,CH),'feet.webp')
    if name=='bodyA':   # feather tufts where the legs meet the belly, made from real belly feathers; drawn behind the body so no gap can open
        la=np.zeros(al.shape,np.float32); lrgb=rgb.copy()
        for (cx_,cy_,rx_,ry_) in [(400,1340,25,34),(592,1388,25,32)]:
            e=1-np.sqrt(((xx-cx_)/rx_)**2+((yy-cy_)/ry_)**2); e=np.clip(e*2.2,0,1)
            sx_,sy_=470-cx_,1290-cy_; src=np.roll(np.roll(rgb,-sy_,axis=0),-sx_,axis=1)
            m=e>0; lrgb[m]=(src[m]*0.86).astype(np.uint8); la=np.maximum(la,e*255)
        save(lrgb,la.astype(np.uint8),(CX,CY,CW,CH),'legs.webp')
    core=((al>128)&(fm==0)).astype(np.uint8)*255
    core=cv2.morphologyEx(core,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(19,19)))
    core=cv2.morphologyEx(core,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(15,15)))
    balpha=np.where(fm>0,np.minimum(al,cv2.GaussianBlur(core,(0,0),1.5)),al)
    brgb=cv2.inpaint(rgb,cv2.dilate(fm,np.ones((5,5),np.uint8)),7,cv2.INPAINT_TELEA)
    c=curve(cx); gfade=np.clip((yy-(c-60))/33,0,1); gfade=gfade*gfade*(3-2*gfade)   # the head mesh covers everything above the neck
    save(brgb,(balpha*gfade).astype(np.uint8),(CX,CY,CW,CH),name+'.webp')
