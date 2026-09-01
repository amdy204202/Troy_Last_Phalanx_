from pathlib import Path
import math, random, wave, struct

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'/'audio'
OUT.mkdir(parents=True,exist_ok=True)
RATE=22050

def write(name,seconds,fn):
    total=int(seconds*RATE);data=[]
    for i in range(total):
        t=i/RATE
        v=max(-.98,min(.98,fn(t)))
        data.append(struct.pack('<h',int(v*32767)))
    with wave.open(str(OUT/name),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(b''.join(data))

def pluck(t,start,freq,decay=5):
    x=t-start
    if x<0:return 0
    return math.exp(-x*decay)*(math.sin(2*math.pi*freq*x)+.34*math.sin(4*math.pi*freq*x)+.16*math.sin(6*math.pi*freq*x))

def drum(t,start,pitch=72):
    x=t-start
    if x<0 or x>.42:return 0
    noise=(random.random()*2-1)*math.exp(-x*20)
    return math.sin(2*math.pi*(pitch-34*x)*x)*math.exp(-x*10)+noise*.24

field_notes=[146.83,174.61,196,220,196,174.61,130.81,146.83]*6
def field(t):
    bar=t%24;v=.05*math.sin(2*math.pi*73.415*t)+.025*math.sin(2*math.pi*110*t)
    beat=.5
    for j in range(max(0,int(bar/beat)-1),min(len(field_notes),int(bar/beat)+1)):
        v+=.13*pluck(bar,j*beat,field_notes[j],5.8)
    for j in range(12):v+=.16*drum(bar,j*2,67)
    return v*.72

boss_notes=[146.83,196,220,261.63,233.08,220,196,174.61]*8
def boss(t):
    bar=t%16;v=.07*math.sin(2*math.pi*73.415*t)+.035*math.sin(2*math.pi*146.83*t)
    beat=.25
    for j in range(max(0,int(bar/beat)-1),min(len(boss_notes),int(bar/beat)+1)):
        v+=.11*pluck(bar,j*beat,boss_notes[j],7.2)
    for j in range(16):v+=.19*drum(bar,j,82 if j%4 else 60)
    return v*.75

random.seed(1200)
write('battle-loop.wav',24,field)
random.seed(1201)
write('boss-loop.wav',16,boss)
write('spear.wav',.28,lambda t:(random.random()*2-1)*math.exp(-t*28)*.22+math.sin(2*math.pi*(720-1300*t)*t)*math.exp(-t*13)*.45)
write('sword.wav',.34,lambda t:(random.random()*2-1)*math.exp(-t*18)*.3+math.sin(2*math.pi*(980-1700*t)*t)*math.exp(-t*10)*.42)
write('shield.wav',.42,lambda t:math.sin(2*math.pi*(138-70*t)*t)*math.exp(-t*7)*.72+(random.random()*2-1)*math.exp(-t*23)*.16)
write('pickup.wav',.24,lambda t:math.sin(2*math.pi*(520+950*t)*t)*math.exp(-t*6)*.42)
write('level.wav',.75,lambda t:sum(.2*pluck(t,i*.12,f,7) for i,f in enumerate([293.66,349.23,440,587.33])))
write('evolve.wav',1.15,lambda t:sum(.18*pluck(t,i*.13,f,4.8) for i,f in enumerate([146.83,196,220,293.66,392,440])))
write('boss-horn.wav',1.4,lambda t:(math.sin(2*math.pi*110*t)+.45*math.sin(2*math.pi*165*t)+.2*math.sin(2*math.pi*220*t))*min(1,t*7)*math.exp(-t*1.45)*.28)
write('revive.wav',1.0,lambda t:sum(.18*pluck(t,i*.1,f,4.2) for i,f in enumerate([196,233.08,293.66,392,466.16])))
print(f'generated {len(list(OUT.glob("*.wav")))} audio assets in {OUT}')
