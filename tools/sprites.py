import cv2, numpy as np
from PIL import Image
OUT='/home/user/perchy/src/media/'
S=0.75; CX,CY,CW,CH=100,480,880,1100          # stage crop in frame coords
HX,HY,HW,HH=400,715,370,400                    # head sprite rect
def load(n,dx=0,dy=0):
    rgb=cv2.imread(f'f_{n}.png'); a=np.array(Image.open(f'bird_{n}.png'))[:,:,3]
    M=np.float32([[1,0,dx],[0,1,dy]]); h,w=a.shape
    return cv2.warpAffine(rgb,M,(w,h)), cv2.warpAffine(a,M,(w,h))
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
# background with the bird painted out
hole=cv2.dilate((aA>8).astype(np.uint8)*255,np.ones((7,7),np.uint8))
small=cv2.resize(A,None,fx=.25,fy=.25,interpolation=cv2.INTER_AREA); hs=cv2.resize(hole,None,fx=.25,fy=.25)
ip=cv2.resize(cv2.inpaint(small,(hs>0).astype(np.uint8)*255,7,cv2.INPAINT_NS),(A.shape[1],A.shape[0]),interpolation=cv2.INTER_CUBIC)
ip=cv2.GaussianBlur(ip,(0,0),5); hm=cv2.GaussianBlur(hole,(0,0),2)[:,:,None]/255.
bg=(A*(1-hm)+ip*hm).astype(np.uint8)[CY:CY+CH,CX:CX+CW,::-1]
Image.fromarray(bg).resize((round(CW*S),round(CH*S)),Image.LANCZOS).save(OUT+'bg.jpg',quality=82)
