const relayedEvents = [
	"beforeinput", "input", "change", "compositionstart", "compositionupdate", "compositionend",
	"keydown", "keypress", "keyup", "focus", "blur", "focusin", "focusout", "select", "selectstart", "selectionchange",
	"pointerover", "pointerout", "pointerenter", "pointerleave", "pointermove", "pointerdown", "pointerup", "pointercancel",
	"mouseover", "mouseout", "mouseenter", "mouseleave", "mousemove", "mousedown", "mouseup", "click", "dblclick", "contextmenu", "wheel",
	"copy", "cut", "paste", "touchstart", "touchmove", "touchend", "touchcancel",
	"dragstart", "drag", "dragenter", "dragover", "dragleave", "drop", "dragend", "submit", "reset", "scroll"
];

// Share relay state across separately bundled copies of CoCreate Utils.
const relayStateKey = Symbol.for("CoCreate.utils.iframeRelay");

function relayDocument(frame, frameDocument) {
	try {
		let state = frame[relayStateKey];
		if (!state) {
			state = { documents: new WeakSet(), loadListener: null };
			Object.defineProperty(frame, relayStateKey, { value: state });
		}
		if (state.documents.has(frameDocument)) return;
		state.documents.add(frameDocument);

		for (const type of relayedEvents) {
			frameDocument.addEventListener(type, event => {
				const CustomEvent = frame.ownerDocument.defaultView.CustomEvent;
				const cursor = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
					? { x: event.clientX, y: event.clientY }
					: null;
				frame.dispatchEvent(new CustomEvent(type, {
					bubbles: true,
					cancelable: event.cancelable,
					composed: true,
					detail: {
						target: event.target,
						relatedTarget: event.relatedTarget,
						document: frameDocument,
						cursor,
						originalEvent: event
					}
				}));
			}, true);
		}
	} catch (iframeError) {
		console.log(`Cross-origin frame event relay failed for: ${frame}`, iframeError);
	}
}

/** Relay events from same-origin iframe documents through their iframe elements. */
export function relayEvents(frames) {
	for (const frame of frames) {
		if (!frame) continue;
		try {
			const state = frame[relayStateKey];
			if (!state) {
				const newState = { documents: new WeakSet(), loadListener: null };
				Object.defineProperty(frame, relayStateKey, { value: newState });
			}
			const frameState = frame[relayStateKey];
			if (!frameState.loadListener) {
				frameState.loadListener = () => {
					try {
						if (frame.contentDocument) relayDocument(frame, frame.contentDocument);
					} catch (iframeError) {
						console.log(`Cross-origin frame event relay failed for: ${frame}`, iframeError);
					}
				};
				frame.addEventListener("load", frameState.loadListener);
			}
			if (frame.contentDocument) relayDocument(frame, frame.contentDocument);
		} catch (iframeError) {
			console.log(`Cross-origin frame event relay failed for: ${frame}`, iframeError);
		}
	}
}

export default { relayEvents };
