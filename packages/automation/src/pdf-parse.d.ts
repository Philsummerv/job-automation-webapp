// pdf-parse's index.js runs a debug branch under ESM import, so we import the
// lib entry directly — @types/pdf-parse only declares the package root.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdf from "pdf-parse";
  export default pdf;
}
