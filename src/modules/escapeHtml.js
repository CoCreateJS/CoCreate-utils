export function escapeHtml(html) {
	return html
		.replaceAll("&", "&amp")
		.replaceAll("<", "&lt")
		.replaceAll(">", "&gt;")
		.replaceAll("'", "&#39;")
		.replaceAll('"', "&quot;");
}
