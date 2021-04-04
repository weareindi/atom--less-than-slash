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

                // get all cursors
                let cursorPositions = textEditor.getCursorBufferPositions();

                // remove invalid cursors
                cursorPositions = cursorPositions.filter((cursorPosition) => {
                    // start
                    const start = [cursorPosition.row, cursorPosition.column - 2];

                    // get text between start and end
                    const text = textEditor.getTextInRange([start, cursorPosition]);

                    // if preceeded by <, retiurn cursor position
                    if (text[0] === '<') {
                        return cursorPosition;
                    }
                });

                // sort cursorPositions for rows, so upper most cursor is at first
                cursorPositions.sort((cursorA, cursorB) => {
                    if (cursorA.row > cursorB.row) {
                        return 1;
                    }

                    return -1;
                });

                // skip if no valid cursors
                if (cursorPositions.length <= 0) {
                    return;
                }

                // process cursors
                this.processCursors(textEditor, cursorPositions)
                    .then(() => {
                        this.resetCursors(textEditor, cursorPositions);
                    })
            }));
        });
    },

    /**
     * [processCursors description]
     * @param { object} textEditor      A valid atom text editor
     * @param  {array}  cursorPositions A array of point values corresponding to cursor positions in the document
     */
    async processCursors(textEditor, cursorPositions) {
        // loop through cursors
        for (let i = 0; i < cursorPositions.length; i++) {
            // cursor position
            const cursorPosition = cursorPositions[i];

            await this.findOpeningTag(textEditor, cursorPosition)
                .then((openingTag) => {
                    return this.getClosingTag(openingTag);
                })
                .then((closingTag) => {
                    // complete tag in editor
                    textEditor.setCursorBufferPosition(cursorPosition);
                    textEditor.insertText(closingTag);

                    // update stored cursor position so we can move to the end of closing tag
                    cursorPosition.column += closingTag.length;

                    // update cursorPositions
                    cursorPositions[i] = cursorPosition;
                });
        }
    },

    /**
     * Reset cursor positions to end of each insert
     * @param {object} textEditor      A valid atom text editor
     * @param {array}  cursorPositions A array of point values corresponding to cursor positions in the document
     */
    resetCursors(textEditor, cursorPositions) {
        // loop through cursors
        for (let i = 0; i < cursorPositions.length; i++) {
            // cursor position
            const cursorPosition = cursorPositions[i];

            // set cursors
            textEditor.addCursorAtBufferPosition(cursorPosition);
        }
    },

    /**
     * Find a valid opening tag
     * @return {string} A string, hopefully containing a tag but could just be empty
     */
    findOpeningTag(textEditor, cursorPosition, totalRows) {
        return new Promise((resolve, reject) => {
            // no totalRows defined? set first iteration to settings batch size value
            if (typeof totalRows === 'undefined') {
                totalRows = this.settings.batchSize;
            }

            // start at cursor and go back up the document, a defined amount of rows at a time to find rows from position 0
            let rowsFromZero = (cursorPosition.row) - totalRows;

            // less than zero?, set to 0
            if (rowsFromZero < 0) {
                rowsFromZero = 0;
            }

            // get the text in range between cursor point and calulated rows before
            const range = new Range(
                new Point(rowsFromZero, 0),
                new Point(cursorPosition.row, cursorPosition.column - 2)
            );

            // get the text
            const string = textEditor.getTextInBufferRange(range);

            if (string.length === 0) {
                return resolve('');
            }

            // increment totalRows by settings defined batch size
            totalRows += this.settings.batchSize;

            // check the markup
            return checkMarkup(string)
                .then(
                    // no matching tags found
                    () => {
                        // rowsFromZero already zero so we must have exhausted test. aka. there are no matches
                        if (rowsFromZero === 0) {
                            return resolve('');
                        }

                        // try again
                        return this.findOpeningTag(textEditor, cursorPosition, totalRows);
                    },

                    // unclosed tags have been found
                    (results) => {
                        // clear results
                        results = this.cleanResults(results);

                        // no tag found and no rows left? return empty
                        if (results.length <= 0 && rowsFromZero <= 0) {
                            return resolve('');
                        }

                        // no tag found? try again
                        if (results.length <= 0 && rowsFromZero !== 0) {
                            return this.findOpeningTag(textEditor, cursorPosition, totalRows);
                        }

                        // get last result from array (nearest to cursor)
                        const closestResult = results[results.length - 1];

                        // return found tag
                        return resolve(closestResult.code);
                    }
                );
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
     * Turn an opening tag into a closing tag
     * @param  {string} openingTag A complete opening tag
     * @return {string}            A matching closing tag
     */
    getClosingTag(openingTag) {
        return new Promise((resolve) => {
            // skip if no tag returned
            if (openingTag.length <= 0) {
                return resolve('');
            }

            // remove any attributes on tag
            let closingTag = openingTag.split(' ')[0];

            // remove both opening and closing brakets so we can rebuild consistently
            closingTag = closingTag.replace(/<|>/g, '');

            // apply closing bracket only (as we've type </ in the editor)
            closingTag += '>';

            return resolve(closingTag);
        });
    },

    /**
     * Deactivate the package
     */
    deactivate() {
        // remove all binds
        this.disposables.dispose();
    },
};
