import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { openLink, keys } from "./wispr.js";

const log = streamDeck.logger;
const fail = (ev, what) => (e) => {
  log.error(`${what} failed: ${e.message}`);
  return ev.action.showAlert();
};

/** Opens a Wispr deep link (settings.link: start-hands-free | stop-hands-free | switch-mic | open). */
class Link extends SingletonAction {
  manifestId = "com.sree.wispr.link";
  onKeyUp(ev) {
    return openLink(ev.payload.settings.link ?? "open").catch(fail(ev, "link"));
  }
}

/** Presses a Wispr shortcut with real key events. settings.keys e.g. "opt+1"; settings.hold = keep it down while the key is held. */
class Keys extends SingletonAction {
  manifestId = "com.sree.wispr.keys";
  onKeyDown(ev) {
    const { keys: combo, hold } = ev.payload.settings;
    if (hold) return keys("down", combo).catch(fail(ev, `hold ${combo}`));
  }
  onKeyUp(ev) {
    const { keys: combo, hold } = ev.payload.settings;
    return keys(hold ? "up" : "tap", combo).catch(fail(ev, `${hold ? "release" : "tap"} ${combo}`));
  }
}

/** One key for hands-free dictation: press to start (turns red), press again to stop. */
class Dictate extends SingletonAction {
  manifestId = "com.sree.wispr.dictate";
  async onKeyUp(ev) {
    const on = ev.payload.state === 1;
    try {
      await openLink(on ? "stop-hands-free" : "start-hands-free");
      await ev.action.setState(on ? 0 : 1);
    } catch (e) {
      await fail(ev, "dictate")(e);
    }
  }
}

streamDeck.actions.registerAction(new Link());
streamDeck.actions.registerAction(new Keys());
streamDeck.actions.registerAction(new Dictate());
streamDeck.connect();
