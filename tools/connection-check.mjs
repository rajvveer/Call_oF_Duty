const w = new WebSocket("ws://localhost:8787");
let count = 0;
w.onopen = () =>
  w.send(
    JSON.stringify({
      type: "hello",
      name: "HARNESS",
      room: "TEST-NET",
      loadout: "kestrel",
      attachment: "balanced",
      operator: "sable",
      difficulty: "regular",
    }),
  );
w.onmessage = (e) => {
  console.log(String(e.data).slice(0, 240));
  if (++count > 2) w.close();
};
setTimeout(() => process.exit(), 3000);
