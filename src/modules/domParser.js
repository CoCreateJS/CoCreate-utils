export function domParser(str) {
	try {
		var mainTag = str.match(/\<(?<tag>[a-z0-9]+)(.*?)?\>/).groups.tag;
	} catch (e) {}
	let doc;
	switch (mainTag) {
		case "html":
			doc = new DOMParser().parseFromString(str, "text/html");
			return doc.documentElement;
		case "body":
			doc = new DOMParser().parseFromString(str, "text/html");
			return doc.body;
		case "head":
			doc = new DOMParser().parseFromString(str, "text/html");
			return doc.head;
		default:
			let con = document.createElement("dom-parser");
			con.innerHTML = str;
			return con;
	}
}
