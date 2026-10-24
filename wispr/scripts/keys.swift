// Presses real keys, modifiers included (as their own key events, not just flags), so apps that
// watch raw key codes — like Wispr Flow's shortcuts — see them. Fn works too.
//   keys tap 58+18     press Option, press 1, release 1, release Option
//   keys down 63       hold Fn (push-to-talk) ... keys up 63
//   keys tap 59+14 59+32 51   several combos in a row (here: ctrl+e, ctrl+u, delete)
import CoreGraphics
import Foundation

let modifierFlags: [CGKeyCode: CGEventFlags] = [
  54: .maskCommand, 55: .maskCommand, 56: .maskShift, 60: .maskShift,
  58: .maskAlternate, 61: .maskAlternate, 59: .maskControl, 62: .maskControl, 63: .maskSecondaryFn,
]

let args = CommandLine.arguments
guard args.count >= 3, ["tap", "down", "up"].contains(args[1]) else {
  FileHandle.standardError.write("usage: keys tap|down|up <code>+<code>...\n".data(using: .utf8)!)
  exit(2)
}
let combos = args[2...].map { $0.split(separator: "+").compactMap { CGKeyCode($0) } }
let source = CGEventSource(stateID: .hidSystemState)
var held: CGEventFlags = []

func post(_ code: CGKeyCode, down: Bool, pause: useconds_t = 12_000) {
  guard let e = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else { return }
  if let flag = modifierFlags[code] {
    if down { held.insert(flag) } else { held.remove(flag) }
    e.type = .flagsChanged
  }
  e.flags = held
  e.post(tap: .cghidEventTap)
  usleep(pause)
}

let codes = combos[0]
switch args[1] {
case "down":
  codes.forEach { post($0, down: true) }
case "up":
  // a separate process from "down": start from the held modifiers, then release in reverse
  codes.forEach { if let f = modifierFlags[$0] { held.insert(f) } }
  codes.reversed().forEach { post($0, down: false) }
default:
  let pause: useconds_t = combos.count > 4 ? 3_000 : 12_000  // long sequences (Clear) go fast
  for combo in combos {
    combo.forEach { post($0, down: true, pause: pause) }
    combo.reversed().forEach { post($0, down: false, pause: pause) }
  }
}
