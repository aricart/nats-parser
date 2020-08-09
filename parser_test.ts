import { Err, Info, Msg, Parser, ParserEvents, State } from "./parser.ts";
import {
  assertEquals,
  assertThrows,
  assert,
} from "https://deno.land/std@0.63.0/testing/asserts.ts";
import { Dispatcher } from "./queued_iterator.ts";

const te = new TextEncoder();
const td = new TextDecoder();

class NoopDispatcher implements Dispatcher<ParserEvents> {
  push(a: ParserEvents): void {}
}

class TestDispatcher implements Dispatcher<ParserEvents> {
  count: number = 0;
  pings: number = 0;
  pongs: number = 0;
  ok: number = 0;
  errs: Err[] = [];
  infos: Info[] = [];
  msgs: Msg[] = [];

  push(a: ParserEvents): void {
    this.count++;
    if (typeof a === "object" && "msg" in a) {
      this.msgs.push(a);
    } else if (typeof a === "object" && "info" in a) {
      this.infos.push(a);
    } else if (typeof a === "object" && "message" in a) {
      this.errs.push(a);
    } else if (a === "ping") {
      this.pings++;
    } else if (a === "pong") {
      this.pongs++;
    } else if (a === "ok") {
      this.ok++;
    } else {
      throw new Error(`unknown parser evert ${a}`);
    }
  }
}

function testSteps(
  data: Uint8Array,
): { states: State[]; dispatcher: TestDispatcher } {
  const e = new TestDispatcher();
  const p = new Parser(e);
  const states: State[] = [];
  assertEquals(p.state, State.OP_START);

  for (let i = 0; i < data.length; i++) {
    states.push(p.state);
    p.parse(Uint8Array.of(data[i]));
  }
  states.push(p.state);
  return { states, dispatcher: e };
}

Deno.test("parser - ping", () => {
  const states = [
    State.OP_START,
    State.OP_P,
    State.OP_PI,
    State.OP_PIN,
    State.OP_PING,
    State.OP_PING,
    State.OP_START,
  ];
  const results = testSteps(te.encode("PING\r\n"));
  assertEquals(results.states, states);
  assertEquals(results.dispatcher.pings, 1);
  assertEquals(results.dispatcher.count, 1);

  const events = new TestDispatcher();
  const p = new Parser(events);
  p.parse(te.encode("PING\r\n"));
  assertEquals(p.state, State.OP_START);

  p.parse(te.encode("PING \r"));
  assertEquals(p.state, State.OP_PING);

  p.parse(te.encode("PING \r \n"));
  assertEquals(p.state, State.OP_START);

  assertEquals(events.pings, 2);
  assertEquals(events.count, 2);
});

Deno.test("parser - err", () => {
  const states = [
    State.OP_START,
    State.OP_MINUS,
    State.OP_MINUS_E,
    State.OP_MINUS_ER,
    State.OP_MINUS_ERR,
    State.OP_MINUS_ERR_SPC,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.OP_START,
  ];
  const results = testSteps(te.encode(`-ERR '234 6789'\r\n`));
  assertEquals(results.states, states);
  assertEquals(results.dispatcher.errs.length, 1);
  assertEquals(results.dispatcher.count, 1);
  assertEquals(results.dispatcher.errs[0].message, `'234 6789'`);

  const events = new TestDispatcher();
  const p = new Parser(events);
  p.parse(te.encode("-ERR 'Any error'\r\n"));
  assertEquals(p.state, State.OP_START);
  assertEquals(events.errs.length, 1);
  assertEquals(events.count, 1);
  assertEquals(events.errs[0].message, `'Any error'`);
});

Deno.test("parser - ok", () => {
  let states = [
    State.OP_START,
    State.OP_PLUS,
    State.OP_PLUS_O,
    State.OP_PLUS_OK,
    State.OP_PLUS_OK,
    State.OP_START,
  ];
  let result = testSteps(te.encode("+OK\r\n"));
  assertEquals(result.states, states);

  states = [
    State.OP_START,
    State.OP_PLUS,
    State.OP_PLUS_O,
    State.OP_PLUS_OK,
    State.OP_PLUS_OK,
    State.OP_PLUS_OK,
    State.OP_PLUS_OK,
    State.OP_START,
  ];
  result = testSteps(te.encode("+OKay\r\n"));

  assertEquals(result.states, states);
});

Deno.test("parser - errors", () => {
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode(" PING"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("POO"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("Px"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("PIx"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("PINx"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("PONx"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("ZOO"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("Mx\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("MSx\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("MSGx\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("MSG foo\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("MSG \r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("MSG foo 1\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("MSG foo bar 1\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("MSG foo bar 1 baz\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("MSG foo 1 bar baz\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("+x\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("+0x\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("-x\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("-Ex\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("-ERx\r\n"));
  });
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("-ERRx\r\n"));
  });
});

Deno.test("parser - split msg", () => {
  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("MSG a\r\n"));
  });

  assertThrows(() => {
    const p = new Parser(new NoopDispatcher());
    p.parse(te.encode("MSG a b c\r\n"));
  });

  let d = new TestDispatcher();
  let p = new Parser(d);
  p.parse(te.encode("MSG a"));
  assert(p.argBuf);
  p.parse(te.encode(" 1 3\r\nf"));
  assertEquals(p.ma.size, 3, "size");
  assertEquals(p.ma.sid, 1, "sid");
  assertEquals(p.ma.subject, te.encode("a"), "subject");
  assert(p.msgBuf, "should message buffer");
  p.parse(te.encode("oo\r\n"));
  assertEquals(d.count, 1);
  assertEquals(d.msgs.length, 1);
  assertEquals(td.decode(d.msgs[0].msg.subject), "a");
  assertEquals(td.decode(d.msgs[0].data), "foo");
  assertEquals(p.msgBuf, undefined);

  p.parse(te.encode("MSG a 1 3\r\nba"));
  assertEquals(p.ma.size, 3, "size");
  assertEquals(p.ma.sid, 1, "sid");
  assertEquals(p.ma.subject, te.encode("a"), "subject");
  assert(p.msgBuf, "should message buffer");
  p.parse(te.encode("r\r\n"));
  assertEquals(d.msgs.length, 2);
  assertEquals(td.decode(d.msgs[1].data), "bar");
  assertEquals(p.msgBuf, undefined);

  p.parse(te.encode("MSG a 1 6\r\nfo"));
  assertEquals(p.ma.size, 6, "size");
  assertEquals(p.ma.sid, 1, "sid");
  assertEquals(p.ma.subject, te.encode("a"), "subject");
  assert(p.msgBuf, "should message buffer");
  p.parse(te.encode("ob"));
  p.parse(te.encode("ar\r\n"));

  assertEquals(d.msgs.length, 3);
  assertEquals(td.decode(d.msgs[2].data), "foobar");
  assertEquals(p.msgBuf, undefined);

  const payload = new Uint8Array(103);
  payload.set(te.encode("foo"));
});
