# The brief in Sonic Pi: threads (live_loops) instead of patterns. Synths are SuperCollider underneath.
use_bpm 130

live_loop :kick do
  sample :bd_tek, amp: 1.4
  sleep 1
end

live_loop :clap, sync: :kick do
  sleep 1
  with_fx :reverb, room: 0.4, mix: 0.3 do
    sample :perc_snap, amp: 0.8   # closest stock sample to a 909 clap
  end
  sleep 1
end

live_loop :hats, sync: :kick do
  [0.35, 0.55, 1, 0.55].each_with_index do |a, i|
    sample :drum_cymbal_closed, amp: a * 0.5, finish: 0.1
    sample :drum_cymbal_open, amp: 0.25, finish: 0.15 if i == 2
    sleep 0.25
  end
end

live_loop :bass, sync: :kick do
  cut = range(60, 95, step: 1).mirror.ring   # a slow sweep, advanced one notch per bar
  notes = [:f1, :f1, nil, :f1, :f1, nil, nil, :ab1, :f1, :f1, :f1, nil, nil, :c2, :eb2, nil]
  use_synth :tb303
  notes.each do |n|
    play n, release: 0.17, cutoff: cut.tick(:c), res: 0.7, wave: 0, amp: 0.8 if n
    sleep 0.25
  end
end

live_loop :stabs, sync: :kick do
  use_synth :dsaw
  chords = [[:f3, :ab3, :c4, :eb4, :g4], [:db3, :f3, :ab3, :c4, :eb4]].ring
  with_fx :reverb, room: 0.8, mix: 0.4 do
    with_fx :echo, phase: 0.75, decay: 4, mix: 0.4 do
      2.times do
        c = chords.look
        sleep 1
        play c, release: 0.16, cutoff: rrand(85, 105), detune: 0.15, amp: 0.35
        sleep 2.5
        play c, release: 0.16, cutoff: rrand(85, 105), detune: 0.15, amp: 0.35
        sleep 0.5
      end
      chords.tick
    end
  end
end
