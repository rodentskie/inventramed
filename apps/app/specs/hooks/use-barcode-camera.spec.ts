import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  NotFoundException,
  RGBLuminanceSource,
} from '@zxing/library';
import { UprightOneDReader } from '../../src/hooks/use-barcode-camera';

const SIZE = 64;

/** Like the browser's canvas source: claims to rotate, and throws when asked to. */
class BrokenRotationSource extends RGBLuminanceSource {
  public override isRotateSupported() {
    return true;
  }

  public override rotateCounterClockwise(): never {
    throw new Error('rotation failed');
  }
}

describe('UprightOneDReader', () => {
  it('reports a frame with no code as not found, without rotating it', () => {
    const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);
    const source = new BrokenRotationSource(new Uint8ClampedArray(SIZE * SIZE).fill(255), SIZE, SIZE);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));

    expect(() => new UprightOneDReader(hints).decodeBitmap(bitmap)).toThrow(NotFoundException);
  });
});
