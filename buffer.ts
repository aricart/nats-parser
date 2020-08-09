// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.

// This code has been ported almost directly from Go's src/bytes/buffer.go
// Copyright 2009 The Go Authors. All rights reserved. BSD license.
// https://github.com/golang/go/blob/master/LICENSE

// Reader is the interface that wraps the basic read() method.
// https://golang.org/pkg/io/#Reader

//@internal
export class AssertionError extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = "AssertionError";
  }
}

// @internal
export function assert(cond: unknown, msg = "Assertion failed."): asserts cond {
  if (!cond) {
    throw new AssertionError(msg);
  }
}

// MIN_READ is the minimum ArrayBuffer size passed to a read call by
// buffer.ReadFrom. As long as the Buffer has at least MIN_READ bytes beyond
// what is required to hold the contents of r, readFrom() will not grow the
// underlying buffer.
const MIN_READ = 32 * 1024;
const MAX_SIZE = 2 ** 32 - 2;

// `off` is the offset into `dst` where it will at which to begin writing values
// from `src`.
// Returns the number of bytes copied.
function copyBytes(src: Uint8Array, dst: Uint8Array, off = 0): number {
  const r = dst.byteLength - off;
  if (src.byteLength > r) {
    src = src.subarray(0, r);
  }
  dst.set(src, off);
  return src.byteLength;
}

export class Buffer {
  #buf: Uint8Array; // contents are the bytes buf[off : len(buf)]
  #off = 0; // read at buf[off], write at buf[buf.byteLength]

  constructor(ab?: ArrayBuffer) {
    if (ab == null) {
      this.#buf = new Uint8Array(0);
      return;
    }

    this.#buf = new Uint8Array(ab);
  }

  bytes(options: { copy?: boolean } = { copy: true }): Uint8Array {
    if (options.copy === false) return this.#buf.subarray(this.#off);
    return this.#buf.slice(this.#off);
  }

  empty(): boolean {
    return this.#buf.byteLength <= this.#off;
  }

  get length(): number {
    return this.#buf.byteLength - this.#off;
  }

  get capacity(): number {
    return this.#buf.buffer.byteLength;
  }

  truncate(n: number): void {
    if (n === 0) {
      this.reset();
      return;
    }
    if (n < 0 || n > this.length) {
      throw Error("bytes.Buffer: truncation out of range");
    }
    this.#reslice(this.#off + n);
  }

  reset(): void {
    this.#reslice(0);
    this.#off = 0;
  }

  #tryGrowByReslice = (n: number): number => {
    const l = this.#buf.byteLength;
    if (n <= this.capacity - l) {
      this.#reslice(l + n);
      return l;
    }
    return -1;
  };

  #reslice = (len: number): void => {
    assert(len <= this.#buf.buffer.byteLength);
    this.#buf = new Uint8Array(this.#buf.buffer, 0, len);
  };

  read(p: Uint8Array): number | null {
    if (this.empty()) {
      // Buffer is empty, reset to recover space.
      this.reset();
      if (p.byteLength === 0) {
        // this edge case is tested in 'bufferReadEmptyAtEOF' test
        return 0;
      }
      return null;
    }
    const nread = copyBytes(this.#buf.subarray(this.#off), p);
    this.#off += nread;
    return nread;
  }

  write(p: Uint8Array): number {
    const m = this.#grow(p.byteLength);
    return copyBytes(p, this.#buf, m);
  }

  #grow = (n: number): number => {
    const m = this.length;
    // If buffer is empty, reset to recover space.
    if (m === 0 && this.#off !== 0) {
      this.reset();
    }
    // Fast: Try to grow by means of a reslice.
    const i = this.#tryGrowByReslice(n);
    if (i >= 0) {
      return i;
    }
    const c = this.capacity;
    if (n <= Math.floor(c / 2) - m) {
      // We can slide things down instead of allocating a new
      // ArrayBuffer. We only need m+n <= c to slide, but
      // we instead let capacity get twice as large so we
      // don't spend all our time copying.
      copyBytes(this.#buf.subarray(this.#off), this.#buf);
    } else if (c + n > MAX_SIZE) {
      throw new Error("The buffer cannot be grown beyond the maximum size.");
    } else {
      // Not enough space anywhere, we need to allocate.
      const buf = new Uint8Array(Math.min(2 * c + n, MAX_SIZE));
      copyBytes(this.#buf.subarray(this.#off), buf);
      this.#buf = buf;
    }
    // Restore this.#off and len(this.#buf).
    this.#off = 0;
    this.#reslice(Math.min(m + n, MAX_SIZE));
    return m;
  };

  grow(n: number): void {
    if (n < 0) {
      throw Error("Buffer.grow: negative count");
    }
    const m = this.#grow(n);
    this.#reslice(m);
  }
}
