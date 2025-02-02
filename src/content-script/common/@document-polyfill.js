// Check whether loading is complete
// (http://developer.mozilla.org/en-US/docs/Web/API/Document/DOMContentLoaded_event#Checking_whether_loading_is_already_complete):
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", atDocumentPolyfill)
} else {
  atDocumentPolyfill()
}

function atDocumentPolyfill() {
  let table, replace, i, url
  let domainWithHyphen = ""

  // Get the full domain name under which the document is located, in which the script is running
  let domainString = document.location.hostname

  // Replace all dashes (-) in domain names with "^" - dashes are needed to separate domains from each other
  replace = domainString.replace(/-/g, "^")

  // Split the string anywhere there is a dot and creating a table from the divided fragments, without dots
  table = replace.split(".")
  // Separate each domain and put them in reverse order - that's the way to process domains
  // Reverse the order of items in the table
  table.reverse()

  // Create a string containing domains in order of the highest hierarchy to the lowest, separated by dashes (-)
  for (i = 0; i < table.length; i++) {
    domainWithHyphen = domainWithHyphen + table[i] + "-"
  }

  if (domainWithHyphen != "-") {
    // Add a data attribute to the "html" element (https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/data-*)
    document.querySelector("html").setAttribute("data-a-domain", domainWithHyphen)

    // Read the document URL (this is read-only)
    url = document.URL

    document.querySelector("html").setAttribute("data-a-url", url)
  }
}
