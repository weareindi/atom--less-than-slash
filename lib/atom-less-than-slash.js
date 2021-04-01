'use babel';

import {Range, Point} from 'atom';
import checkMarkup from 'unclosed-markup';

export default {

    textEditor: null,
    cursorPosition: null,

    activate(state) {
        // observe all editor tabs
        atom.workspace.observeTextEditors(textEditor => {
            // get editor element
            const textEditorElement = atom.views.getView(textEditor);

            // attach keyup listener
            // Note: we don't use the textEditor.onDidChange event here because
            // we only want to evalute when '/' is typed rather than met after a backspace/delete
            textEditorElement.addEventListener('keyup', (event) => {
                // skip if key press isn't a forward slash
                if (event.key !== '/') {
                    return;
                }

                const cursors = textEditor.getCursors();

                // if more than 1 cursor, skip
                if (cursors.length > 1) {
                    return;
                }

                // get single cursor
                const cursor = cursors[0];

                // get only cursor position
                const cursorPosition = cursor.getBufferPosition();

                // move start cursor to before typed </
                // Note: we're going back two columns as keyup moves cursor ahead by one
                const start = [cursorPosition.row, cursorPosition.column - 2];

                // end is current cursor position
                const end = [cursorPosition.row, cursorPosition.column];

                // get text between start and end
                const text = textEditor.getTextInRange([start, end]);

                // text doesn't match '</', skip
                if (text !== '</') {
                    return;
                }

                // update current textEditor
                this.textEditor = textEditor;

                // update current cursorPosition
                this.cursorPosition = cursorPosition;

                // process/find unclosed tag
                this.process();
            });
        });
    },

    deactivate() {
        // console.log('deactivate');
    },

    findOpeningTag(iteration = 0) {
        // start at cursor and go back up the document, one row at a time
        const rowsFromStart = (this.cursorPosition.row) - iteration;

        // if no more rows available, return empty string
        if (rowsFromStart < 0) {
            return '';
        }

        // get the text in range from cursor point to start of rows from cursor
        const range = new Range(
            new Point(rowsFromStart, 0),
            new Point(this.cursorPosition.row, this.cursorPosition.column)
        );

        // get the text
        const string = this.textEditor.getTextInBufferRange(range);

        // increase iteration
        iteration++;

        return checkMarkup(string)
            .then(
                () => {
                    return this.findOpeningTag(iteration);
                },
                (results) => {
                    // clear results
                    results = this.cleanResults(results);

                    // no tag found? try again
                    if (results.length <= 0) {
                        return this.findOpeningTag(iteration);
                    }

                    // get last result from array (nearest to cursor)
                    const closestResult = results[results.length - 1];

                    // return found tag
                    return closestResult.code;
                });
    },

    cleanResults(results = []) {
        // we don't want results to include closing tags, so remove them
        return results.filter((item, index) => !item.code.startsWith('</'));;
    },

    process() {
        this.findOpeningTag()
            .then((openingTag) => {
                this.completeTag(openingTag);
            });
    },

    completeTag(openingTag) {
        // skip if no tag returned
        if (!openingTag.length) {
            return;
        }

        // remove any attributes on tag
        let tag = openingTag.split(' ')[0];

        // remove both opening and closing brakets so we can rebuild consistently
        tag = tag.replace(/<|>/g, '');

        // apply closing bracket only (as we've type </ in the editor)
        tag += '>';

        // complete tag in editor
        this.textEditor.insertText(tag);
    }
};
