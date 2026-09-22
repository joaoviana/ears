// Retrospective stereo capture and audition. Installed inside the engine's boot routine.
// The ring and the meters see LIVE audio; audition replaces output only after those taps.
~installMoments = { |server, volumeNode, tui|
  var ring, position, player, playGeneration = 0;
  var ringSeconds = 32;
  SynthDef(\momentRing, { |buf, pos|
    var phase = Phasor.ar(0, 1, 0, BufFrames.kr(buf));
    BufWr.ar(In.ar(0, 2), buf, phase);
    Out.kr(pos, [A2K.kr(phase), Line.kr(0, 1, ringSeconds)]);
  }).add;
  SynthDef(\momentPlayer, { |buf|
    var dur = BufDur.kr(buf), live = In.ar(0, 2);
    var envelope = EnvGen.kr(Env.linen(0.01, (dur - 0.02).max(0), 0.01), doneAction: 2);
    var clip = PlayBuf.ar(2, buf, BufRateScale.kr(buf));
    ReplaceOut.ar(0, (live * (1 - envelope)) + (clip * envelope));
  }).add;
  ring = Buffer.alloc(server, (server.sampleRate * ringSeconds).asInteger, 2);
  position = Bus.control(server, 2);
  server.sync;
  Synth.before(volumeNode, \momentRing, [\buf, ring, \pos, position]);

  OSCdef(\momentCapture, { |msg|
    var id = msg[1].asString, dest = msg[2].asString, seconds = msg[3].asFloat.clip(0.1, 24);
    // Position is sampled on the server, but its wall-clock mapping is approximate.
    position.getn(2, { |values|
      var head = values[0], end = Main.elapsedTime;
      // Startup availability follows DSP time, not wall time (Bluetooth devices can drift).
      var available = ((values[1] * ring.numFrames).floor.asInteger - server.options.blockSize).max(0);
      var frames = (seconds * server.sampleRate).floor.asInteger.min(available);
      if(frames < (server.sampleRate * 0.1)) {
        tui.sendMsg('/clipd', id, dest, 0, server.sampleRate, end, Main.elapsedTime, "recorder warming up");
      } {
        fork {
          var snapshot, start, first;
          snapshot = Buffer.alloc(server, frames, 2);
          server.sync;
          start = (head.asInteger - frames) % ring.numFrames;
          first = frames.min(ring.numFrames - start);
          // scsynth's CopyBuf uses FRAMES, despite Buffer.copyData's numSamples argument name.
          // Keep eight seconds of headroom in the 32 s ring while longer demo probes copy their opening arc.
          ring.copyData(snapshot, 0, start, first);
          if(first < frames) { ring.copyData(snapshot, first, 0, frames - first) };
          server.sync;
          if((Main.elapsedTime - end) > (ringSeconds - seconds - 1)) {
            tui.sendMsg('/clipd', id, dest, 0, server.sampleRate, end, Main.elapsedTime, "capture overrun");
          } {
            snapshot.write(dest, "WAV", "float", frames);
            server.sync;
            tui.sendMsg('/clipd', id, dest, frames, server.sampleRate, end, Main.elapsedTime, "", head.asInteger, ring.numFrames);
          };
          snapshot.free;
        };
      };
    });
  }, '/clip');

  OSCdef(\momentStop, {
    playGeneration = playGeneration + 1;
    if(player.notNil) { player.free; player = nil };
  }, '/audition/stop');
  OSCdef(\momentPlay, { |msg|
    var id = msg[1].asString, file = msg[2].asString, generation;
    playGeneration = playGeneration + 1; generation = playGeneration;
    if(player.notNil) { player.free; player = nil };
    if(File.exists(file).not) {
      tui.sendMsg('/audition', id, "error", "clip file is missing");
    } {
      Buffer.read(server, file, action: { |buffer|
        if(generation != playGeneration) { buffer.free } {
          if(buffer.numChannels != 2) {
            buffer.free; tui.sendMsg('/audition', id, "error", "clip must be stereo");
          } {
            player = Synth.before(volumeNode, \momentPlayer, [\buf, buffer]);
            player.onFree { buffer.free; tui.sendMsg('/audition', id, "ended", "") };
            tui.sendMsg('/audition', id, "playing", "");
          };
        };
      });
    };
  }, '/audition/play');
};
