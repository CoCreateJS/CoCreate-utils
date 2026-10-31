// Reference snapshot from CoCreate-file/src/client.js.
// Preserved for comparison; not imported or executed by Utils.
// Surrounding component services remain dependencies of these excerpts.

function readFile(file, readAs) {
	return new Promise((resolve) => {
		const fileType = file.type.split("/");

		if (fileType[1] === "directory") {
			return resolve(file);
		} else if (readAs) {
			if (readAs === "blob") return resolve(file);
		} else if (fileType[0] === "image") {
			readAs = "readAsDataURL";
		} else if (fileType[0] === "video") {
			readAs = "readAsDataURL";
		} else if (fileType[0] === "audio") {
			readAs = "readAsDataURL";
		} else if (fileType[1] === "pdf") {
			readAs = "readAsDataURL";
		} else if (
			["doc", "msword", "docx", "xlsx", "pptx"].includes(fileType[1])
		) {
			readAs = "readAsBinaryString";
		} else {
			readAs = "readAsText";
		}

		const reader = new FileReader();
		reader[readAs](file);

		reader.onload = () => {
			file.src = reader.result;
			if (["doc", "msword", "docx", "xlsx", "pptx"].includes(fileType)) {
				file.src = btoa(file.src);
			}

			resolve(file);
		};
	});
}
