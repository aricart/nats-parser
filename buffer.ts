// Copyright 2018-2020 the Deno authors. All rights reserved. MIT license.

// This code has been ported almost directly from Go's src/bytes/buffer.go
// Copyright 2009 The Go Authors. All rights reserved. BSD license.
// https://github.com/golang/go/blob/master/LICENSE

// Removed Reader/Writer, uses of `#` for private fields as this is not
// supported in some browsers.

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
  _buf: Uint8Array; // contents are the bytes _buf[off : len(_buf)]
  _off = 0; // read at _buf[off], write at _buf[_buf.byteLength]

  constructor(ab?: ArrayBuffer) {
    if (ab == null) {
      this._buf = new Uint8Array(0);
      return;
    }

    this._buf = new Uint8Array(ab);
  }

  bytes(options: { copy?: boolean } = { copy: true }): Uint8Array {
    if (options.copy === false) return this._buf.subarray(this._off);
    return this._buf.slice(this._off);
  }

  empty(): boolean {
    return this._buf.byteLength <= this._off;
  }

  get length(): number {
    return this._buf.byteLength - this._off;
  }

  get capacity(): number {
    return this._buf.buffer.byteLength;
  }

  truncate(n: number): void {
    if (n === 0) {
      this.reset();
      return;
    }
    if (n < 0 || n > this.length) {
      throw Error("bytes.Buffer: truncation out of range");
    }
    this._reslice(this._off + n);
  }

  reset(): void {
    this._reslice(0);
    this._off = 0;
  }

  _tryGrowByReslice = (n: number): number => {
    const l = this._buf.byteLength;
    if (n <= this.capacity - l) {
      this._reslice(l + n);
      return l;
    }
    return -1;
  };

  _reslice = (len: number): void => {
    assert(len <= this._buf.buffer.byteLength);
    this._buf = new Uint8Array(this._buf.buffer, 0, len);
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
    const nread = copyBytes(this._buf.subarray(this._off), p);
    this._off += nread;
    return nread;
  }

  write(p: Uint8Array): number {
    const m = this._grow(p.byteLength);
    return copyBytes(p, this._buf, m);
  }

  _grow = (n: number): number => {
    const m = this.length;
    // If buffer is empty, reset to recover space.
    if (m === 0 && this._off !== 0) {
      this.reset();
    }
    // Fast: Try to _grow by means of a _reslice.
    const i = this._tryGrowByReslice(n);
    if (i >= 0) {
      return i;
    }
    const c = this.capacity;
    if (n <= Math.floor(c / 2) - m) {
      // We can slide things down instead of allocating a new
      // ArrayBuffer. We only need m+n <= c to slide, but
      // we instead let capacity get twice as large so we
      // don't spend all our time copying.
      copyBytes(this._buf.subarray(this._off), this._buf);
    } else if (c + n > MAX_SIZE) {
      throw new Error("The buffer cannot be grown beyond the maximum size.");
    } else {
      // Not enough space anywhere, we need to allocate.
      const buf = new Uint8Array(Math.min(2 * c + n, MAX_SIZE));
      copyBytes(this._buf.subarray(this._off), buf);
      this._buf = buf;
    }
    // Restore this.off and len(this._buf).
    this._off = 0;
    this._reslice(Math.min(m + n, MAX_SIZE));
    return m;
  };

  grow(n: number): void {
    if (n < 0) {
      throw Error("Buffer._grow: negative count");
    }
    const m = this._grow(n);
    this._reslice(m);
  }
}
