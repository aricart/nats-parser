import { Parser, State } from "./parser.ts";
import {
  assertEquals,
} from "https://deno.land/std@0.63.0/testing/asserts.ts";

const te = new TextEncoder();

Deno.test("ping", () => {
  const p = new Parser();

  assertEquals(p.state, State.OP_START);

  const ping = te.encode("PING\r\n");
  p.parse(ping.subarray(0, 1));
  assertEquals(p.state, State.OP_P);
  p.parse(ping.subarray(1, 2));
  assertEquals(p.state, State.OP_PI);
  p.parse(ping.subarray(2, 3));
  assertEquals(p.state, State.OP_PIN);
  p.parse(ping.subarray(3, 4));
  assertEquals(p.state, State.OP_PING);
  p.parse(ping.subarray(4, 5));
  assertEquals(p.state, State.OP_PING);
  p.parse(ping.subarray(5, 6));
  assertEquals(p.state, State.OP_START);

  p.parse(ping);
  assertEquals(p.state, State.OP_START);

  p.parse(te.encode("PING \r"));
  assertEquals(p.state, State.OP_PING);

  p.parse(te.encode("PING \r \n"));
  assertEquals(p.state, State.OP_START);
});
