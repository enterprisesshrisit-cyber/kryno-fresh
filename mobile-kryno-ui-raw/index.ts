const { Buffer } = require('buffer');

function installTextDecoderCompat() {
  const KrynoTextDecoderClass = (globalThis as any).__krynoTextDecoderCompatClass;
  const ExistingTextDecoder = (globalThis as any).TextDecoder;
  if (KrynoTextDecoderClass && ExistingTextDecoder === KrynoTextDecoderClass) {
    return;
  }

  class KrynoTextDecoderCompat {
    private decoder: any;
    private encoding: string;

    constructor(label = 'utf-8', options?: Record<string, unknown>) {
      const normalized = label.toLowerCase().replace(/[_\s]/g, '-');
      this.encoding =
        normalized === 'utf8' || normalized === 'unicode-1-1-utf-8'
          ? 'utf-8'
          : normalized === 'utf16le' || normalized === 'utf-16' || normalized === 'ucs-2' || normalized === 'ucs2'
            ? 'utf-16le'
            : normalized;

      if (ExistingTextDecoder && this.encoding !== 'utf-8' && this.encoding !== 'utf-16le') {
        try {
          this.decoder = new ExistingTextDecoder(label, options);
        } catch {
          this.decoder = null;
        }
      }
    }

    decode(input?: ArrayBuffer | ArrayBufferView) {
      if (this.decoder) {
        try {
          return this.decoder.decode(input);
        } catch {
          // Fall through to the Buffer-backed decoder so cached encrypted messages
          // cannot blank the authenticated app if a native decoder rejects a label.
        }
      }

      if (!input) {
        return '';
      }

      const bytes =
        input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);

      return Buffer.from(bytes).toString(this.encoding === 'utf-16le' ? 'utf16le' : 'utf8');
    }
  }

  (globalThis as any).TextDecoder = KrynoTextDecoderCompat;
  (globalThis as any).__krynoTextDecoderCompatClass = KrynoTextDecoderCompat;
  (globalThis as any).__krynoTextDecoderCompatInstalled = true;
  console.log('[KrynoStartup] TextDecoder compat installed');
}

function installFormDataCompat() {
  if ((globalThis as any).FormData) {
    return;
  }

  try {
    const formDataModule = require('react-native/Libraries/Network/FormData');
    (globalThis as any).FormData = formDataModule.default ?? formDataModule;
    console.log('[KrynoStartup] FormData compat installed from React Native');
    return;
  } catch (error) {
    console.log('[KrynoStartup] FormData compat fallback active');
  }

  class KrynoFormDataCompat {
    private _parts: Array<[string, unknown]> = [];

    append(key: string, value: unknown) {
      this._parts.push([key, value]);
    }

    getAll(key: string) {
      return this._parts
        .filter(([name]) => name === key)
        .map(([, value]) => value);
    }

    getParts() {
      return this._parts.map(([name, value]) => {
        const headers: Record<string, string> = {
          'content-disposition': `form-data; name="${name}"`
        };

        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const media = value as { name?: string; type?: string };
          if (typeof media.name === 'string') {
            headers['content-disposition'] += `; filename="${encodeURIComponent(media.name.replace(/\//g, '_'))}"`;
          }
          if (typeof media.type === 'string') {
            headers['content-type'] = media.type;
          }
          return { ...(value as Record<string, unknown>), headers, fieldName: name };
        }

        return { string: String(value), headers, fieldName: name };
      });
    }
  }

  (globalThis as any).FormData = KrynoFormDataCompat;
}

console.log('[KrynoStartup] index registered');
installTextDecoderCompat();
installFormDataCompat();

const { registerRootComponent } = require('expo');
installTextDecoderCompat();
installFormDataCompat();
const App = require('./App').default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
