## 0.0.1
* Basic implementation of `</` command.

## 0.0.2
* Remove attributes from closing tag

## 0.0.3
* Allow for deactivation
* Improve comments

## 0.0.4
* Add setting menu
* Allow for batching of tag check, default: 1000 rows
    * The aim here is to improve performance in large documents (> 10000 rows) where the unclosed tag is at the top of the document and the </ is at the bottom.
