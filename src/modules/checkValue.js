export function checkValue(value) {
	if (/{{\s*([\w\W]+)\s*}}/g.test(value)) return false;
	else return true;
}
