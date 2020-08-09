export const MAX_CONTROL_LINE_SIZE = 4096;

export interface MsgArg {
  subject: Uint8Array;
  reply?: Uint8Array;
  sid: number;
  hdr: number;
  size: number;
}

export function concat(origin?: Uint8Array, b?: Uint8Array): Uint8Array {
  if (origin === undefined && b === undefined) {
    return new Uint8Array(0);
  }
  if (origin === undefined) {
    return b!;
  }
  if (b === undefined) {
    return origin;
  }
  const output = new Uint8Array(origin.length + b.length);
  output.set(origin, 0);
  output.set(b, origin.length);
  return output;
}

export function append(origin: Uint8Array, b: number): Uint8Array {
  return concat(origin, Uint8Array.of(b));
}

export enum State {
  OP_START = 0,
  OP_PLUS,
  OP_PLUS_O,
  OP_PLUS_OK,
  OP_MINUS,
  OP_MINUS_E,
  OP_MINUS_ER,
  OP_MINUS_ERR,
  OP_MINUS_ERR_SPC,
  MINUS_ERR_ARG,
  OP_M,
  OP_MS,
  OP_MSG,
  OP_MSG_SPC,
  MSG_ARG,
  MSG_PAYLOAD,
  MSG_END,
  OP_H,
  OP_P,
  OP_PI,
  OP_PIN,
  OP_PING,
  OP_PO,
  OP_PON,
  OP_PONG,
  OP_I,
  OP_IN,
  OP_INF,
  OP_INFO,
  OP_INFO_SPC,
  INFO_ARG,
}

enum cc {
  CR = "\r".charCodeAt(0),
  E = "E".charCodeAt(0),
  e = "e".charCodeAt(0),
  F = "F".charCodeAt(0),
  f = "f".charCodeAt(0),
  G = "G".charCodeAt(0),
  g = "g".charCodeAt(0),
  H = "H".charCodeAt(0),
  h = "h".charCodeAt(0),
  I = "I".charCodeAt(0),
  i = "i".charCodeAt(0),
  K = "K".charCodeAt(0),
  k = "k".charCodeAt(0),
  M = "M".charCodeAt(0),
  m = "m".charCodeAt(0),
  MINUS = "-".charCodeAt(0),
  N = "N".charCodeAt(0),
  n = "n".charCodeAt(0),
  NL = "\n".charCodeAt(0),
  O = "O".charCodeAt(0),
  o = "o".charCodeAt(0),
  P = "P".charCodeAt(0),
  p = "p".charCodeAt(0),
  PLUS = "+".charCodeAt(0),
  R = "R".charCodeAt(0),
  r = "r".charCodeAt(0),
  S = "S".charCodeAt(0),
  s = "s".charCodeAt(0),
  SPACE = " ".charCodeAt(0),
  TAB = "\t".charCodeAt(0),
}

const decoder = new TextDecoder();

export class Parser {
  state: State = State.OP_START;
  as: number = 0;
  drop: number = 0;
  hdr: number = 0;
  ma: MsgArg = {} as MsgArg;
  argBuf?: Uint8Array;
  msgBuf?: Uint8Array;

  constructor() {
    this.state = State.OP_START;
  }

  parse(buf: Uint8Array): void {
    let i: number;
    for (i = 0; i < buf.length; i++) {
      const b = buf[i];
      switch (this.state) {
        case State.OP_START:
          switch (b) {
            case cc.M:
            case cc.m:
              this.state = State.OP_M;
              this.hdr = -1;
              this.ma.hdr = -1;
              break;
            case cc.H:
            case cc.h:
              this.state = State.OP_H;
              this.hdr = 0;
              this.ma.hdr = 0;
              break;
            case cc.P:
            case cc.p:
              this.state = State.OP_P;
              break;
            case cc.PLUS:
              this.state = State.OP_PLUS;
              break;
            case cc.MINUS:
              this.state = State.OP_MINUS;
              break;
            case cc.I:
            case cc.i:
              this.state = State.OP_I;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_H:
          switch (b) {
            case cc.M:
            case cc.m:
              this.state = State.OP_M;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_M:
          switch (b) {
            case cc.S:
            case cc.s:
              this.state = State.OP_MS;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_MS:
          switch (b) {
            case cc.G:
            case cc.g:
              this.state = State.OP_MSG;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_MSG_SPC:
          switch (b) {
            case cc.SPACE:
            case cc.TAB:
              continue;
            default:
              this.state = State.MSG_ARG;
              this.as = i;
          }
          break;
        case State.MSG_ARG:
          switch (b) {
            case cc.CR:
              this.drop = 1;
              break;
            case cc.NL:
              const arg: Uint8Array = this.argBuf ??
                buf.subarray(this.as, i - this.drop);
              const err = this.processMsgArgs(arg);
              if (err) {
                throw err;
              }
              this.drop = 0;
              this.as = i + 1;
              this.state = State.MSG_PAYLOAD;

              // jump ahead with the index. If this overruns
              // what is left we fall out and process a split buffer.
              i = this.as + this.ma.size;
              break;
            default:
              if (this.argBuf) {
                this.argBuf = append(this.argBuf, b);
              }
          }
          break;
        case State.MSG_PAYLOAD:
          if (this.msgBuf) {
            if (this.msgBuf.length >= this.ma.size) {
              processMsg(this.ma, this.msgBuf);
              this.argBuf = new Uint8Array(0);
              this.msgBuf = new Uint8Array(0);
              this.state = State.MSG_END;
            } else {
              let toCopy = this.ma.size - this.msgBuf.length;
              const avail = buf.length - i;

              if (avail < toCopy) {
                toCopy = avail;
              }

              if (toCopy > 0) {
                const start = this.msgBuf.length;
                this.msgBuf = this.msgBuf.subarray(0, start + toCopy);
                this.msgBuf.set(buf.subarray(i, i + toCopy), start);
                i = (i + toCopy) - 1;
              } else {
                this.msgBuf = append(this.msgBuf, b);
              }
            }
          } else if (i - this.as >= this.ma.size) {
            processMsg(this.ma, buf.subarray(this.as, i));
            this.argBuf = new Uint8Array(0);
            this.msgBuf = new Uint8Array(0);
            this.state = State.MSG_END;
          }
          break;
        case State.MSG_END:
          switch (b) {
            case cc.NL:
              this.drop = 0;
              this.as = i + 1;
              this.state = State.OP_START;
              break;
            default:
              continue;
          }
          break;
        case State.OP_PLUS:
          switch (b) {
            case cc.O:
            case cc.o:
              this.state = State.OP_PLUS_O;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_PLUS_O:
          switch (b) {
            case cc.K:
            case cc.k:
              this.state = State.OP_PLUS_OK;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_PLUS_OK:
          switch (b) {
            case cc.NL:
              processOK();
              this.drop = 0;
              this.state = State.OP_START;
              break;
          }
          break;
        case State.OP_MINUS:
          switch (b) {
            case cc.E:
            case cc.e:
              this.state = State.OP_MINUS_E;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_MINUS_E:
          switch (b) {
            case cc.R:
            case cc.r:
              this.state = State.OP_MINUS_ER;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_MINUS_ER:
          switch (b) {
            case cc.R:
            case cc.r:
              this.state = State.OP_MINUS_ERR;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_MINUS_ERR:
          switch (b) {
            case cc.SPACE:
            case cc.TAB:
              this.state = State.OP_MINUS_ERR_SPC;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_MINUS_ERR_SPC:
          switch (b) {
            case cc.SPACE:
            case cc.TAB:
              continue;
            default:
              this.state = State.MINUS_ERR_ARG;
              this.as = i;
          }
          break;
        case State.MINUS_ERR_ARG:
          switch (b) {
            case cc.CR:
              this.drop = 1;
              break;
            case cc.NL:
              let arg: Uint8Array;
              if (this.argBuf) {
                arg = this.argBuf;
                this.argBuf = undefined;
              } else {
                arg = buf.subarray(this.as, i - this.drop);
              }
              processError(decoder.decode(arg));
              this.drop = 0;
              this.as = i + 1;
              this.state = State.OP_START;
              break;
            default:
              if (this.argBuf) {
                this.argBuf = append(this.argBuf, b);
              }
          }
          break;
        case State.OP_P:
          switch (b) {
            case cc.I:
            case cc.i:
              this.state = State.OP_PI;
              break;
            case cc.O:
            case cc.o:
              this.state = State.OP_PO;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_PO:
          switch (b) {
            case cc.N:
            case cc.n:
              this.state = State.OP_PON;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_PON:
          switch (b) {
            case cc.G:
            case cc.g:
              this.state = State.OP_PONG;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_PONG:
          switch (b) {
            case cc.NL:
              processPong();
              this.drop = 0;
              this.state = State.OP_START;
              break;
          }
          break;
        case State.OP_PI:
          switch (b) {
            case cc.N:
            case cc.n:
              this.state = State.OP_PIN;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_PIN:
          switch (b) {
            case cc.G:
            case cc.g:
              this.state = State.OP_PING;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_PING:
          switch (b) {
            case cc.NL:
              processPing();
              this.drop = 0;
              this.state = State.OP_START;
              break;
          }
          break;
        case State.OP_I:
          switch (b) {
            case cc.N:
            case cc.n:
              this.state = State.OP_IN;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_IN:
          switch (b) {
            case cc.F:
            case cc.f:
              this.state = State.OP_INF;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_INF:
          switch (b) {
            case cc.O:
            case cc.o:
              this.state = State.OP_INFO;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_INFO:
          switch (b) {
            case cc.SPACE:
            case cc.TAB:
              this.state = State.OP_INFO_SPC;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
        case State.OP_INFO_SPC:
          switch (b) {
            case cc.SPACE:
            case cc.TAB:
              continue;
            default:
              this.state = State.INFO_ARG;
              this.as = i;
          }
          break;
        case State.INFO_ARG:
          switch (b) {
            case cc.CR:
              this.drop = 1;
              break;
            case cc.NL:
              let arg: Uint8Array;
              if (this.argBuf) {
                arg = this.argBuf;
                this.argBuf = undefined;
              } else {
                arg = buf.subarray(this.as, i - this.drop);
              }
              processInfo(arg);
              this.drop = 0;
              this.as = i + 1;
              this.state = State.OP_START;
              break;
            default:
              throw new Error(
                `parse error [${this.state}] ${buf.subarray(i)}`,
              );
          }
          break;
      }
    }

    if (
      (this.state === State.MSG_ARG || this.state === State.MINUS_ERR_ARG ||
        this.state === State.INFO_ARG) && this.argBuf
    ) {
      this.argBuf = concat(this.argBuf, buf.subarray(this.as, i - this.drop));
    }

    if (this.state === State.MSG_PAYLOAD && !this.msgBuf) {
      if (!this.argBuf) {
        this.cloneMsgArg();
      }
      // FIXME - need to have buffers to grow and reuse space
      this.msgBuf = new Uint8Array(this.ma.size);
      this.msgBuf.set(buf.subarray(this.as));
    }
  }

  cloneMsgArg() {
    this.argBuf = new Uint8Array(0);
    this.argBuf = concat(this.argBuf, this.ma.subject);
    this.argBuf = concat(this.argBuf, this.ma.reply);
    this.ma.subject = this.argBuf.subarray(0, this.ma.subject.length);
    if (this.ma.reply) {
      this.ma.reply = this.argBuf.subarray(this.ma.subject.length);
    }
  }

  processMsgArgs(arg: Uint8Array): (Error | void) {
    if (this.hdr >= 0) {
      return this.processHeaderMsgArgs(arg);
    }

    const args: Uint8Array[] = [];
    let start = -1;
    for (let i = 0; i < arg.length; i++) {
      const b = arg[i];
      switch (b) {
        case cc.SPACE:
        case cc.TAB:
        case cc.CR:
        case cc.NL:
          if (start >= 0) {
            args.push(arg.subarray(start, i));
            start = -1;
          }
          break;
        default:
          if (start < 0) {
            start = 0;
          }
      }
    }
    if (start >= 0) {
      args.push(arg.slice(start));
    }

    switch (args.length) {
      case 3:
        this.ma.subject = args[0];
        this.ma.sid = parseInt(decoder.decode(args[1]));
        this.ma.reply = undefined;
        this.ma.size = parseInt(decoder.decode(args[2]));
        break;
      case 4:
        this.ma.subject = args[0];
        this.ma.sid = parseInt(decoder.decode(args[1]));
        this.ma.reply = args[2];
        this.ma.size = parseInt(decoder.decode(args[3]));
        break;
      default:
        return new Error(`processMsgArgs Parse Error: ${arg}`);
    }

    if (this.ma.sid < 0) {
      return new Error(`processMsgArgs Bad or Missing Sid Error: ${arg}`);
    }
    if (this.ma.size < 0) {
      return new Error(`processMsgArgs Bad or Missing Size Error: ${arg}`);
    }
  }

  processHeaderMsgArgs(arg: Uint8Array): (Error | void) {
    const args: Uint8Array[] = [];
    let start = -1;
    for (let i = 0; i < arg.length; i++) {
      const b = arg[i];
      switch (b) {
        case cc.SPACE:
        case cc.TAB:
        case cc.CR:
        case cc.NL:
          if (start >= 0) {
            args.push(arg.subarray(start, i));
            start = -1;
          }
          break;
        default:
          if (start < 0) {
            start = 0;
          }
      }
    }
    if (start >= 0) {
      args.push(arg.subarray(start));
    }

    switch (args.length) {
      case 4:
        this.ma.subject = args[0];
        this.ma.sid = parseInt(decoder.decode(args[1]));
        this.ma.reply = undefined;
        this.ma.hdr = parseInt(decoder.decode(args[2]));
        this.ma.size = parseInt(decoder.decode(args[3]));
        break;
      case 5:
        this.ma.subject = args[0];
        this.ma.sid = parseInt(decoder.decode(args[1]));
        this.ma.reply = args[2];
        this.ma.hdr = parseInt(decoder.decode(args[3]));
        this.ma.size = parseInt(decoder.decode(args[4]));
        break;
      default:
        return new Error(`processHeaderMsgArgs Parse Error: ${arg}`);
    }

    if (this.ma.sid < 0) {
      return new Error(`processHeaderMsgArgs Bad or Missing Sid Error: ${arg}`);
    }
    if (this.ma.hdr < 0 || this.ma.hdr > this.ma.size) {
      return new Error(
        `processHeaderMsgArgs Bad or Missing Header Size Error: ${arg}`,
      );
    }
    if (this.ma.size < 0) {
      return new Error(
        `processHeaderMsgArgs Bad or Missing Size Error: ${arg}`,
      );
    }
  }
}

function processInfo(ia: Uint8Array) {
  console.log(`INFO ${decoder.decode(ia)}`);
}

function processPing() {
  console.log("PING");
}

function processPong() {
  console.log("PONG");
}

function processOK() {
  console.log("OK");
}

function processError(s: string) {
  console.log(`ERR: ${s}`);
}

function processMsg(ma: MsgArg, data: Uint8Array) {
  console.log(`MSG`);
  console.table(ma);
  console.log(decoder.decode(data));
}
