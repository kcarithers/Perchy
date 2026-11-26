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
# body: head area filled from the chest, alpha trimmed to a neck stub
c=curve(570); headzone=((yy<c+40)&(aA>0)).astype(np.uint8)*255
fill=cv2.inpaint(A,cv2.dilate(headzone,np.ones((7,7),np.uint8)),9,cv2.INPAINT_TELEA)
fill=cv2.GaussianBlur(fill,(0,0),6)
w=np.clip((c+40-yy)/30,0,1)[:,:,None]; body=(A*(1-w)+fill*w).astype(np.uint8)
er=cv2.erode(np.minimum(aA,aB),np.ones((47,47),np.uint8)); er=cv2.GaussianBlur(er,(0,0),5)
k=np.clip((c-yy-20)/40,0,1)   # 0 below the neck line, 1 well above it
ba=aA*(1-k)+er*k*np.clip(1-(c-yy-70)/50,0,1)
save(body,ba.astype(np.uint8),(CX,CY,CW,CH),'body.webp')
print('feet rows', [ (int(np.where(aA[y]>128)[0].min()), int(np.where(aA[y]>128)[0].max())) for y in (1440,1480,1520,1560)])
