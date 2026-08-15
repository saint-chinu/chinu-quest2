"""Generate original, seamless 30-second stage 4/6 BGM masters."""
from pathlib import Path
import wave
import numpy as np

SR, DURATION = 44100, 30.0
N = int(SR * DURATION)
OUT = Path(__file__).resolve().parents[1] / "public" / "audio"

def midi(n): return 440 * 2 ** ((n - 69) / 12)

def envelope(count, attack=.01, release=.08):
    e = np.ones(count); a = min(count, max(1, int(attack*SR))); r = min(count, max(1, int(release*SR)))
    e[:a] *= np.linspace(0, 1, a); e[-r:] *= np.linspace(1, 0, r); return e

def note(buf, start, length, pitch, gain, kind="round", pan=0, glide=0):
    i = int(start*SR); count = min(max(0, N-i), max(1, int(length*SR)))
    if count <= 0: return
    x = np.arange(count)/SR; f = midi(pitch); ph = 2*np.pi*(f*x + .5*glide*x*x)
    if kind == "saw": sig = sum(np.sin(ph*h)/h for h in range(1, 8))*.38
    elif kind == "pulse": sig = np.tanh(2.2*(np.sin(ph)+.28*np.sin(ph*2)))*.55
    elif kind == "bell": sig = (np.sin(ph)+.45*np.sin(ph*2.01)+.22*np.sin(ph*3.98))/1.67
    else: sig = np.sin(ph)*.78 + np.sin(ph*2)*.16 + np.sin(ph*3)*.06
    sig *= envelope(count, min(.018, length/5), min(.14, length/3))*gain
    buf[i:i+count, 0] += sig*np.sqrt((1-pan)*.5); buf[i:i+count, 1] += sig*np.sqrt((1+pan)*.5)

def kick(buf, start, gain=.3):
    i=int(start*SR); count=min(int(.18*SR), N-i)
    if count <= 0: return
    x=np.arange(count)/SR; sig=np.sin(2*np.pi*(105*x-150*x*x))*np.exp(-x*24)*gain
    buf[i:i+count] += sig[:,None]

def noise(buf, start, length, gain, rng, pan=0):
    i=int(start*SR); count=min(int(length*SR), N-i)
    if count <= 0: return
    sig=np.concatenate([[0], np.diff(rng.normal(0,1,count))])*envelope(count,.002,length*.85)*gain
    buf[i:i+count,0] += sig*np.sqrt((1-pan)*.5); buf[i:i+count,1] += sig*np.sqrt((1+pan)*.5)

def echo(buf, seconds, amount, feedback=.3):
    out=buf.copy(); shift=int(seconds*SR)
    for rep in range(1,4):
        s=shift*rep
        if s>=N: break
        out[s:] += buf[:-s,::-1]*amount*feedback**(rep-1)
    return out

def finish(buf):
    buf=np.tanh(buf*1.18); buf*=.86/max(np.max(np.abs(buf)),1e-9)
    seam=int(.025*SR); mix=np.linspace(0,1,seam)[:,None]; joined=buf[-seam:]*(1-mix)+buf[:seam]*mix
    buf[:seam]=joined; buf[-seam:]=joined; return buf

def save(name, buf):
    OUT.mkdir(parents=True, exist_ok=True); pcm=(finish(buf)*32767).astype('<i2')
    with wave.open(str(OUT/name),'wb') as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())

def stage4():
    rng=np.random.default_rng(404); buf=np.zeros((N,2)); beat=60/160; bar=beat*4
    chords=[(50,57,62),(46,53,58),(43,50,55),(48,55,60)]
    lead=[74,76,77,81,79,77,76,74,72,74,76,79,77,76,74,72]
    for b in range(20):
        root,fifth,top=chords[b%4]; base=b*bar
        for s in range(16):
            at=base+s*beat/4; note(buf,at,beat*.19,root-12 if s%4==0 else root,.095,'pulse',-.12 if s%2 else .12)
            if s%2: noise(buf,at,.045,.012,rng,.25 if s%4==1 else -.25)
        for q in range(4): kick(buf,base+q*beat,.29 if q in (0,2) else .2); noise(buf,base+(q+.5)*beat,.1,.035,rng)
        arp=[root+12,fifth+12,top+12,fifth+12]
        for e in range(8): note(buf,base+e*beat/2,beat*.34,arp[e%4],.10+(.025 if b>=8 else 0),'bell',(-.45,.35)[e%2])
        if b>=4:
            for q in range(4): note(buf,base+q*beat,beat*.72,lead[(b*4+q)%len(lead)],.105,'round',.12)
    return echo(buf,beat*.75,.18,.42)

def stage6():
    rng=np.random.default_rng(606); buf=np.zeros((N,2)); beat=60/128; bar=beat*4
    roots=[45,48,42,46]; scale=[0,3,6,7,10,12,15,18]
    for b in range(16):
        root=roots[b%4]; base=b*bar
        note(buf,base,bar,root-12,.11,'round',-.1,.10 if b%2 else -.08); note(buf,base,bar,root+7,.055,'round',.2,-.14)
        for e in range(8):
            pan=np.sin((b*8+e)*np.pi/5)*.72
            note(buf,base+e*beat/2,beat*.42,root+scale[(e*3+b)%8]+12,.10,'bell' if e%3 else 'saw',pan,.7 if e%2 else -.5)
        for q in range(4): kick(buf,base+q*beat,.22)
        for hit in (1.5,3,3.5): noise(buf,base+hit*beat,.13,.026,rng,np.sin(b+hit)*.6)
        if b%4==3:
            for s in range(12): note(buf,base+bar*.72+s*beat/12,beat*.1,root+24+scale[s%8],.045,'pulse',-.8+s*.14)
    wet=echo(buf,beat*.75,.30,.46); t=np.arange(N)/SR
    wet *= (.87+.13*np.sin(2*np.pi*(.19*t+.045*np.sin(2*np.pi*.07*t))))[:,None]
    return wet

if __name__ == '__main__':
    save('stage4-theme.wav', stage4()); save('stage6-theme.wav', stage6())
