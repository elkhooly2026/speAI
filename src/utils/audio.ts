/**
 * Utility for handling PCM audio capture and playback for Gemini Live API.
 */

export class AudioHandler {
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  private activeSources: AudioBufferSourceNode[] = [];
  
  // For playback
  private nextStartTime: number = 0;
  private outputSampleRate: number = 24000; // Gemini output sample rate
  private inputSampleRate: number = 16000; // Gemini input sample rate
  private actualSampleRate: number = 44100;

  constructor(private onAudioData: (base64Data: string) => void) {}

  async startCapture() {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      const error = new Error("يجب استخدام اتصال آمن (HTTPS) للوصول إلى الميكروفون.");
      console.error("Insecure context:", error);
      throw error;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const error = new Error("متصفحك لا يدعم الوصول إلى الميكروفون أو أنك في بيئة غير آمنة (HTTP).");
      console.error("Audio capture not supported:", error);
      throw error;
    }

    try {
      console.log("Requesting getUserMedia...");
      // Try with simpler constraints to maximize compatibility across different browsers/iframes
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("getUserMedia success");

      // Initialize with default sample rate to avoid browser issues, then we'll resample if needed
      this.inputContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.actualSampleRate = this.inputContext.sampleRate;
      console.log("Input AudioContext sample rate:", this.actualSampleRate);

      if (this.inputContext.state === 'suspended') {
        await this.inputContext.resume();
      }

      this.source = this.inputContext.createMediaStreamSource(this.stream);
      // Use a larger buffer (4096) for more stability and to prevent stream fragmentation causing "Network error"
      this.processor = this.inputContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        if (!this.inputContext) return;
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Simple downsampling/resampling to 16kHz
        const ratio = this.actualSampleRate / this.inputSampleRate;
        const targetLength = Math.round(inputData.length / ratio);
        const pcmData = new Int16Array(targetLength);
        
        for (let i = 0; i < targetLength; i++) {
          const index = Math.round(i * ratio);
          if (index < inputData.length) {
            pcmData[i] = Math.max(-1, Math.min(1, inputData[index])) * 0x7fff;
          }
        }
        
        const base64Data = btoa(
          String.fromCharCode(...new Uint8Array(pcmData.buffer))
        );
        this.onAudioData(base64Data);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.inputContext.destination);
    } catch (error) {
      console.error("Error in startCapture:", error);
      this.stopCapture();
      throw error;
    }
  }

  stopCapture() {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.processor?.disconnect();
    this.processor = null;
    this.source?.disconnect();
    this.source = null;
    this.inputContext?.close();
    this.inputContext = null;
  }

  playChunk(base64Data: string) {
    if (!this.outputContext) {
      this.outputContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.outputSampleRate,
      });
      this.nextStartTime = this.outputContext.currentTime;
    }

    if (this.outputContext.state === 'suspended') {
      this.outputContext.resume();
    }

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pcmData = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 0x7fff;
    }

    const buffer = this.outputContext.createBuffer(1, floatData.length, this.outputSampleRate);
    buffer.getChannelData(0).set(floatData);

    const source = this.outputContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputContext.destination);

    const startTime = Math.max(this.outputContext.currentTime, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
    
    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter(s => s !== source);
    };
  }

  clearPlayback() {
    this.activeSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source might have already stopped
      }
    });
    this.activeSources = [];
    this.nextStartTime = this.outputContext?.currentTime || 0;
  }

  close() {
    this.stopCapture();
    this.outputContext?.close();
    this.outputContext = null;
  }
}
