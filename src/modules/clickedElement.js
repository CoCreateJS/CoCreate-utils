export function clickedElement() {
	document.addEventListener("click", (e) => {
		document.clickedElement = e.target;
	});

	try {
		let frames = document.querySelectorAll("iframe");
		for (let frame of frames) {
			try {
				let frameDocument = frame.contentDocument;
				if (!frameDocument.clickedElementListenerAdded) {
					frameDocument.addEventListener("click", (e) => {
						frameDocument.clickedElement = e.target;
					});

					frameDocument.clickedElementListenerAdded = true;
				}
			} catch (iframeError) {
				console.log(
					`Cross-origin frame handling failed for: ${frame}`,
					iframeError
				);
			}
		}
	} catch (e) {
		console.log("Top-level frame document handling failed:", e);
	}
}
