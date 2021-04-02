'use babel';

import {Range, Point, Disposable, CompositeDisposable} from 'atom';
import checkMarkup from 'unclosed-markup';
import config from './config.json';

export default {

    name: 'atom--less-than-slash',
    config: config,
    settings: null,
    textEditor: null,
    cursorPosition: null,
    disposables: new CompositeDisposable(),

    /**
     * Add custom disposable event listener
     * @param {object}   textEditor A valid atom text editor
     * @param {string}   eventName  A valid event name
     * @param {function} handler    The callback/function we want to occur with the event
     */
    addEventListener(textEditor, eventName, handler) {
        // get editor element
        const textEditorElement = atom.views.getView(textEditor);

        // add event listener
        textEditorElement.addEventListener(eventName, handler);

        // return a disposable for this.disposables (CompositeDisposable)
        return new Disposable(() => {
            // return the remove event listener
            return textEditorElement.removeEventListener(eventName, handler);
        });
    },

    /**
     * Activate package
     */
    activate() {
        // observe/prepare package settings
        atom.config.observe(this.name, (settings) => {
            this.settings = settings;
        });

        // observe all editor tabs
        atom.workspace.observeTextEditors(textEditor => {
            // attach keyup listener
            // Note: we don't use the textEditor.onDidChange event here because
            // we only want to evalute when '/' is typed rather than met after a backspace/delete
            // aka. onDidChange is too clever
            this.disposables.add(this.addEventListener(textEditor, 'keyup', (event) => {
                // skip if key press isn't a forward slash
                if (event.key !== '/') {
                    return;
                }

                // get all active cursors in the text editor
                const cursors = textEditor.getCursors();

                // if more than 1 cursor, skip as we only want to handle one at a time (currently)
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
            }));
        });
    },

    /**
     * Deactivate the package
     */
    deactivate() {
        // remove all binds
        this.disposables.dispose();
    },

    /**
     * Find an unclosed open tag
     * @param  {Number} rows How many rows are we traversing?
     */
    findOpeningTag(rows = this.settings.batchSize) {
        // start at cursor and go back up the document, one row at a time
        let rowsFromStart = (this.cursorPosition.row) - rows;

        // if no more rows available, return empty string
        if (rowsFromStart < 0) {
            rowsFromStart = 0;
        }

        // get the text in range from cursor point to start of rows from cursor
        const range = new Range(
            new Point(rowsFromStart, 0),
            new Point(this.cursorPosition.row, this.cursorPosition.column)
        );

        // get the text
        const string = this.textEditor.getTextInBufferRange(range);

        // increase rows to look through
        rows += this.settings.batchSize;

        // check markup for unclosed tags
        return checkMarkup(string)
            .then(
                () => {
                    // nothing found yet, try again
                    if (rowsFromStart === 0) {
                        return '';
                    }

                    return this.findOpeningTag(rows);
                },
                (results) => {
                    // clear results
                    results = this.cleanResults(results);

                    // no tag found? try again
                    if (results.length <= 0) {
                        return this.findOpeningTag(rows);
                    }

                    // get last result from array (nearest to cursor)
                    const closestResult = results[results.length - 1];

                    // return found tag
                    return closestResult.code;
                });
    },

    /**
     * Clean found tags
     * @param  {array} results Results from the 'unclosed-markup' package
     * @return {array}         An array of unclosed tags
     */
    cleanResults(results = []) {
        // we don't want results to include closing tags, so remove them
        return results.filter((item, index) => !item.code.startsWith('</'));
    },

    /**
     * Process the sting / run the task
     * @return {[type]} [description]
     */
    process() {
        this.findOpeningTag()
            .then((openingTag) => {
                return this.completeTag(openingTag);
            })
            .then((closingTag) => {
                // complete tag in editor
                this.textEditor.insertText(closingTag);
            });
    },

    /**
     * Turn an opening tag into a closing tag
     * @param  {string} openingTag A complete opening tag
     * @return {string}            A matching closing tag
     */
    completeTag(openingTag) {
        return new Promise((resolve) => {
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

            return resolve(tag);
        });
    }
};
