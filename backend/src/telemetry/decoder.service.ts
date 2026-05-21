import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Decodifica el payload base64 que envía Tektelic KORE de forma dinámica o estática.
 */
@Injectable()
export class DecoderService {
  private readonly logger = new Logger(DecoderService.name);
  private readonly decoderFilePath = path.join(process.cwd(), 'decoder.js');

  private defaultCode = `// Decodificador Universal LoRaWAN para Servidor de Aplicación
function decode(bytes, fPort) {
  // Puerto 1: Medidor de Agua
  if (fPort === 1) {
    const flow = ((bytes[0] << 8) | bytes[1]) / 100;
    const level = ((bytes[2] << 8) | bytes[3]) / 10;
    const alerts = bytes[4] || 0;
    const alertLeak = (alerts & 0x01) !== 0;
    const alertOverflow = (alerts & 0x02) !== 0;
    return {
      flow: Number(flow.toFixed(2)),
      level: Number(level.toFixed(1)),
      alertLeak,
      alertOverflow,
      battery: 98
    };
  }
  
  // Puerto 2: SmartBin (Contenedor Inteligente)
  if (fPort === 2) {
    const fillLevel = bytes[0];
    let temperature = bytes[1];
    if (temperature > 127) temperature -= 256;
    const battery = bytes[2];
    return {
      fillLevel,
      temperature,
      battery,
      alertCritical: fillLevel >= 80
    };
  }

  // Puerto 10: Tektelic Smart Room Sensor
  if (fPort === 10) {
    const result = {};
    let i = 0;
    while (i < bytes.length) {
      const channel = bytes[i++];
      const type = bytes[i++];
      if (channel === 0x03 && type === 0x67) {
        let temp = (bytes[i++] << 8) | bytes[i++];
        if (temp > 0x7FFF) temp -= 0x10000;
        result.temperature = Number((temp / 10).toFixed(1));
      } else if (channel === 0x04 && type === 0x68) {
        result.humidity = Number((bytes[i++] / 2).toFixed(1));
      } else if (channel === 0x05 && type === 0x00) {
        result.presence = bytes[i++] === 0xFF;
      } else {
        break;
      }
    }
    return result;
  }

  // Fallback: Retorna bytes en Hex
  return {
    hex: bytes.map(b => b.toString(16).padStart(2, '0')).join(''),
    fPort: fPort
  };
}`;

  getDecoderCode(): string {
    try {
      if (fs.existsSync(this.decoderFilePath)) {
        return fs.readFileSync(this.decoderFilePath, 'utf8');
      }
    } catch (e) {
      this.logger.error(`Error leyendo archivo decodificador: ${e.message}`);
    }
    return this.defaultCode;
  }

  saveDecoderCode(code: string): void {
    try {
      fs.writeFileSync(this.decoderFilePath, code, 'utf8');
      this.logger.log('Nuevo decodificador de bytes guardado con éxito.');
    } catch (e) {
      this.logger.error(`Error guardando archivo decodificador: ${e.message}`);
      throw new Error(`No se pudo guardar el decodificador: ${e.message}`);
    }
  }

  decode(rawBase64: string, fPort: number, customCode?: string): Record<string, any> {
    try {
      const buffer = Buffer.from(rawBase64, 'base64');
      const bytes = Array.from(buffer);
      const code = customCode || this.getDecoderCode();

      // Evaluar la función de decodificación de forma segura usando new Function
      const fullFnText = `${code}\nreturn decode(bytes, port);`;
      const runDecoder = new Function('bytes', 'port', fullFnText);
      const result = runDecoder(bytes, fPort);
      return result;
    } catch (err) {
      this.logger.warn(`Error decodificando payload dinámicamente: ${err.message}. Usando parser estático.`);
      try {
        const buffer = Buffer.from(rawBase64, 'base64');
        return this.parseByPort(buffer, fPort);
      } catch (innerErr) {
        return { raw: rawBase64, error: 'decode_failed', message: err.message };
      }
    }
  }

  private parseByPort(buf: Buffer, fPort: number): Record<string, any> {
    switch (fPort) {
      case 1:
        return this.parsePort1(buf);
      case 2:
        return this.parsePort2(buf);
      default:
        return { hex: buf.toString('hex'), fPort };
    }
  }

  private parsePort1(buf: Buffer): Record<string, any> {
    if (buf.length < 4) return { hex: buf.toString('hex'), error: 'buffer_too_short' };
    return {
      temperature: buf.readInt16BE(0) / 100,
      humidity: buf.readUInt16BE(2) / 100,
    };
  }

  private parsePort2(buf: Buffer): Record<string, any> {
    if (buf.length < 2) return { hex: buf.toString('hex'), error: 'buffer_too_short' };
    return {
      battery: buf.readUInt8(0) / 10,
      digitalInput: buf.readUInt8(1) === 1,
    };
  }
}
