#!/usr/bin/env python3
"""Prepare exact clip ranges and restore source audio without modifying inputs."""
import argparse, subprocess
from pathlib import Path

def run(args):
    subprocess.run(args, check=True)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    trim=sub.add_parser('trim');trim.add_argument('source');trim.add_argument('output');trim.add_argument('--start',type=float,default=0);trim.add_argument('--seconds',type=float,default=30)
    audio=sub.add_parser('audio');audio.add_argument('video');audio.add_argument('source_audio');audio.add_argument('output');audio.add_argument('--start',type=float,default=0);audio.add_argument('--seconds',type=float,default=30)
    a=p.parse_args()
    if a.seconds<=0 or a.start<0:p.error('Start must be nonnegative and duration positive.')
    if Path(a.output).exists():p.error('Output exists; choose a new version filename.')
    if a.command=='trim':
        run(['ffmpeg','-v','error','-ss',str(a.start),'-i',a.source,'-t',str(a.seconds),'-map','0:v:0','-an','-r','30','-c:v','libx264','-crf','19','-preset','fast','-movflags','+faststart',a.output])
    else:
        run(['ffmpeg','-v','error','-i',a.video,'-ss',str(a.start),'-i',a.source_audio,'-map','0:v:0','-map','1:a:0','-t',str(a.seconds),'-r','30','-c:v','libx264','-crf','18','-preset','fast','-c:a','aac','-movflags','+faststart',a.output])
    run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',a.output])
if __name__=='__main__':main()
