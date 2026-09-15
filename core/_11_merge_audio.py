import os
import pandas as pd
import subprocess
import soundfile as sf
from pydub import AudioSegment
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.console import Console
from core.utils import *
from core.utils.models import *
from core.utils.task_literals import parse_task_literal
console = Console()

DUB_VOCAL_FILE = 'output/dub.mp3'

DUB_SUB_FILE = 'output/dub.srt'
OUTPUT_FILE_TEMPLATE = f"{_AUDIO_SEGS_DIR}/{{}}.wav"

def load_and_flatten_data(excel_file):
    """Load and flatten Excel data"""
    df = pd.read_excel(excel_file)
    lines = [parse_task_literal(line) for line in df['lines'].tolist()]
    lines = [item for sublist in lines for item in sublist]
    
    new_sub_times = [parse_task_literal(time) for time in df['new_sub_times'].tolist()]
    new_sub_times = [item for sublist in new_sub_times for item in sublist]
    
    return df, lines, new_sub_times

def get_audio_files(df):
    """Generate a list of audio file paths"""
    audios = []
    for index, row in df.iterrows():
        number = row['number']
        line_count = len(parse_task_literal(row['lines']))
        for line_index in range(line_count):
            temp_file = OUTPUT_FILE_TEMPLATE.format(f"{number}_{line_index}")
            audios.append(temp_file)
    return audios

def process_audio_segment(audio_file):
    """Process a single audio segment with MP3 compression"""
    temp_file = f"{audio_file}_temp.mp3"
    ffmpeg_cmd = [
        'ffmpeg', '-nostdin', '-y',
        '-i', audio_file,
        '-ar', '16000',
        '-ac', '1',
        '-b:a', '64k',
        temp_file
    ]
    subprocess.run(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    audio_segment = AudioSegment.from_mp3(temp_file)
    os.remove(temp_file)
    return audio_segment

def merge_audio_segments(audios, new_sub_times, sample_rate, output_file):
    
    with sf.SoundFile(output_file, 'w', samplerate=sample_rate, channels=1, subtype='PCM_16', format='RF64') as writer, \
            Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), BarColumn(), TaskProgressColumn()) as progress:
        merge_task = progress.add_task("🎵 Merging audio segments...", total=len(audios))
        
        for i, (audio_file, time_range) in enumerate(zip(audios, new_sub_times)):
            check_cancel()
            if not os.path.exists(audio_file):
                raise FileNotFoundError(f"Dubbing segment is missing: {audio_file}")
                
            audio_segment = process_audio_segment(audio_file)
            start_time, end_time = time_range
            
            # Original millisecond-quantized gaps, streamed in one-second blocks.
            gap = start_time - new_sub_times[i-1][1] if i else start_time
            frames = int(max(0, int(gap * 1000)) * sample_rate / 1000)
            while frames:
                count = min(frames, sample_rate)
                writer.buffer_write(bytes(count * 2), dtype='int16'); frames -= count
            segment = audio_segment.set_frame_rate(sample_rate).set_channels(1).set_sample_width(2)
            writer.buffer_write(segment.raw_data, dtype='int16')
            progress.advance(merge_task)
    
    return output_file

def create_srt_subtitle():
    df, lines, new_sub_times = load_and_flatten_data(_8_1_AUDIO_TASK)
    
    with open(DUB_SUB_FILE, 'w', encoding='utf-8') as f:
        for i, ((start_time, end_time), line) in enumerate(zip(new_sub_times, lines), 1):
            start_str = f"{int(start_time//3600):02d}:{int((start_time%3600)//60):02d}:{int(start_time%60):02d},{int((start_time*1000)%1000):03d}"
            end_str = f"{int(end_time//3600):02d}:{int((end_time%3600)//60):02d}:{int(end_time%60):02d},{int((end_time*1000)%1000):03d}"
            
            f.write(f"{i}\n")
            f.write(f"{start_str} --> {end_str}\n")
            f.write(f"{line}\n\n")
    
    rprint(f"[bold green]✅ Subtitle file created: {DUB_SUB_FILE}[/bold green]")

def merge_full_audio():
    """Main function: Process the complete audio merging process"""
    console.print("\n[bold cyan]🎬 Starting audio merging process...[/bold cyan]")
    
    with console.status("[bold cyan]📊 Loading data from Excel...[/bold cyan]"):
        df, lines, new_sub_times = load_and_flatten_data(_8_1_AUDIO_TASK)
    console.print("[bold green]✅ Data loaded successfully[/bold green]")
    
    with console.status("[bold cyan]🔍 Getting audio file list...[/bold cyan]"):
        audios = get_audio_files(df)
    console.print(f"[bold green]✅ Found {len(audios)} audio segments[/bold green]")
    
    with console.status("[bold cyan]📝 Generating subtitle file...[/bold cyan]"):
        create_srt_subtitle()
    
    if not audios or len(audios) != len(new_sub_times) or len(lines) != len(audios):
        raise ValueError('Dubbing audio, text and timing counts differ')
    
    sample_rate = 16000
    console.print(f"[bold green]✅ Sample rate: {sample_rate}Hz[/bold green]")

    console.print("[bold cyan]🔄 Starting audio merge process...[/bold cyan]")
    merged_audio = merge_audio_segments(audios, new_sub_times, sample_rate, 'output/dub-pcm.wav')
    
    with console.status("[bold cyan]💾 Exporting final audio file...[/bold cyan]"):
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', merged_audio, '-ar', '16000', '-ac', '1', '-b:a', '64k', DUB_VOCAL_FILE], check=True)
        os.remove(merged_audio)
    console.print(f"[bold green]✅ Audio file successfully merged![/bold green]")
    console.print(f"[bold green]📁 Output file: {DUB_VOCAL_FILE}[/bold green]")

if __name__ == "__main__":
    merge_full_audio()
