/* window.js
 *
 * Copyright 2022 Jonathan Chasteen
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE X CONSORTIUM BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Except as contained in this notice, the name(s) of the above copyright
 * holders shall not be used in advertising or otherwise to promote the sale,
 * use or other dealings in this Software without prior written
 * authorization.
 */

const { GObject, Gtk, GLib, Gio } = imports.gi;
const { ShortUniqueId } = imports.uid;

const uid = new ShortUniqueId({ dictionary: "hex" });

var NovelestWindow = GObject.registerClass({
    GTypeName: 'NovelestWindow',
    Template: 'resource:///org/novelest/Novelest/window.ui',
    InternalChildren: ['workspace', 'btnNewChapter', 'btnDelChapter',
        'organizer', 'editor', 'btnFileMenu', 'fileMenuExit', 'fileMenuSave',
        'startDialog', 'newProjectDialog', 'newProjectInputTitle',
        'newProjectInputAuthor', 'newProjectInputTarget', 'wordCountProgress']
}, class NovelestWindow extends Gtk.ApplicationWindow {
    _init(application) {
        super._init({ application });
        this.app = application;
        this.set_title(GLib.get_application_name());
        this.fileFilter = new Gtk.FileFilter();
        this.fileFilter.add_pattern("*.novelest");
        this.initUI();
    }
    
    initOrganizer() {
        this.store = Gtk.ListStore.new([String, Boolean, String]);
        const colTitle = new Gtk.TreeViewColumn({
            title: "Title",
            resizable: true,
            min_width: 170
        });
        const titleRenderer = new Gtk.CellRendererText();
        colTitle.pack_start(titleRenderer, true);
        colTitle.set_cell_data_func(titleRenderer, (col, cell, model, iter) => {
            cell.editable = true;
            cell.text = this.store.get_value(iter, 0);
        });
        
        const colInclude = new Gtk.TreeViewColumn({
            title: "?",
            resizable: false,
            sizing: Gtk.TreeViewColumnSizing.FIXED,
            max_width: 30
        });
        const colIncludeHeader = new Gtk.Label({
            label: "?",
            hasTooltip: true,
            tooltipText: "Include in export?"
        });
        colIncludeHeader.show();
        colInclude.set_widget(colIncludeHeader);
        const includeRenderer = new Gtk.CellRendererToggle();
        includeRenderer.connect("toggled", (options, path) => {
            path = Gtk.TreePath.new_from_string(path);
            let iter;
            if (iter = this.store.get_iter(path))
                iter = iter[1];
            this.store.set_value(iter, 1, !this.store.get_value(iter, 1));
        });
        colInclude.pack_start(includeRenderer, false);
        colInclude.set_cell_data_func(includeRenderer, (col, cell, model, iter) => {
            cell.editable = true;
            cell.active = this.store.get_value(iter, 1);
        });
        
        this._organizer.set_property("activate-on-single-click", false);
        this._organizer.append_column(colTitle);
        this._organizer.append_column(colInclude);
        this._organizer.set_model(this.store);
        
        let counter = 1;
        this._btnNewChapter.connect(
            "clicked",
            () => {
                const iter = this.store.append();
                const id = uid();
                const chapter = {
                    title: `Chapter ${counter++}`,
                    body: "",
                    include: true
                };
                this.data.chapters[id] = chapter;
                this.store.set(iter, [0, 1, 2], [chapter.title, chapter.include, id]);
                this._organizer.set_cursor(this.store.get_path(iter), null, false);
                this._btnDelChapter.set_sensitive(true);
                this._editor.set_sensitive(true);
            }
        );
        
        this._btnDelChapter.set_sensitive(false);
        this._btnDelChapter.connect(
            "clicked",
            () => {
                let selection;
                let iter;
                if ( (selection = this._organizer.get_selection().get_selected())[1] )
                    iter = selection[2];
                if (this.store.iter_is_valid(iter)) this.store.remove(iter);
                if (this.store.iter_n_children(null) === 0) {
                    this._btnDelChapter.set_sensitive(false);
                    this._editor.get_buffer().set_text("", 0);
                    this._editor.set_sensitive(false);
                }
            }
        );
        
        const selection = this._organizer.get_selection();
        let previous;
        selection.connect(
            "changed",
            (sel) => {
                if (previous && this.store.iter_is_valid(previous)) {
                    const iter = sel.get_selected()[2];
                    const bounds = this._editor.get_buffer().get_bounds();
                    let oldText;
                    if (bounds[0]) {
                        oldText = this._editor.get_buffer().get_text(bounds[0], bounds[1], true);
                    }
                    const newText = this.data.chapters[this.store.get_value(iter, 2)].body || "";
                    this._editor.get_buffer().set_text(newText, newText.length);
                    this.data.chapters[this.store.get_value(previous, 2)].body = oldText || "";
                }
                previous = selection.get_selected()[2];
                this.updateWordCountProgress();
                this.save();
            }
        );
    }
    
    initFileMenu() {
        this._fileMenuExit.connect("activate", () => {
            this.app.quit();
        });
        this._fileMenuSave.connect("activate", () => {
            this.save();
        });
    }
    
    save() {
        const file = Gio.File.new_for_path(this.data.filename);
        file.replace_contents(JSON.stringify(this.data), null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    }
    
    initModals() {
        this._startDialog.connect("response", (dialog, id) => {
            switch(id) {
            case 0:
                this._startDialog.hide();
                this._newProjectDialog.run();
                break;
            case 1:
                log("open");
                break;
            case 2:
                this.app.quit();
                break;
            }
            this._startDialog.close();
        });
        
        this._newProjectInputTarget.connect("insert-text", (widget, text) => {            
            if ("1234567890".indexOf(text) < 0) {
                GObject.signal_stop_emission_by_name(widget, "insert-text");
            }
        });
        
        this._newProjectDialog.connect("response", (dialog, response) => {
            switch (response) {
            case Gtk.ResponseType.OK:
                const title = this._newProjectInputTitle.get_text();
                const author = this._newProjectInputAuthor.get_text();
                const target = parseInt(this._newProjectInputTarget.get_text());
                
                this.data.title = title;
                this.data.author = author;
                this.data.target = target;
                
                this.set_title([GLib.get_application_name(), this.data.title].join(" - "));
                this.updateWordCountProgress();
                
                this._newProjectDialog.hide();
                
                const dialog = new Gtk.FileChooserDialog({
                    title: "Choose project save file",
                    filter: this.fileFilter
                });
                dialog.set_current_folder("/home/jechasteen");
                dialog.set_action(Gtk.FileChooserAction.SAVE);
                dialog.add_button("OK", Gtk.ResponseType.OK);
                dialog.add_button("Cancel", Gtk.ResponseType.CANCEL);
                dialog.connect("response", (dialog, response) => {
                    switch (response) {
                    case Gtk.ResponseType.OK:
                        let filename = dialog.get_filename();
                        if (filename.split(".")[filename.split(".").length - 1] !== "novelest")
                            filename += ".novelest";
                        this.data.filename = filename;
                        log(this.data.filename);
                        dialog.hide();
                        this.save();
                        break;
                    case Gtk.ResponseType.CANCEL:
                        dialog.hide();
                        this._newProjectDialog.run();
                        break;
                    }
                });
                dialog.run();
                
                break;
            case Gtk.ResponseType.CANCEL:
                log("Cancel");
                break;
            }
            this._newProjectDialog.close();
        });
    }
    
    getWordCount() {
        let len = 0;
        if ("store" in this) {
            for (let id in this.data.chapters) {
                if (this.data.chapters[id].body.length > 0)
                    len += this.data.chapters[id].body.split(" ").length;
            }
        }
        return len;
    }
    
    updateWordCountProgress() {
        const wc = this.getWordCount()
        let fraction = wc / this.data.target;
        if (fraction > 1) fraction = 1;
        this._wordCountProgress.set_text(`${wc} / ${this.data.target} Words (${Math.round( fraction * 100 )}%)`);
        this._wordCountProgress.set_fraction(fraction);
    }
    
    initUI() {
        this.data = {
            title: "",
            author: "",
            filename: "",
            target: "",
            chapters: {}
        }
        this._workspace.set_position(198);
        // this._btnFileMenu.set_label("Menu");
        this._editor.set_sensitive(false);
        
        this.initModals();
        
        this._startDialog.run();
        
        this.initOrganizer();
        this.initFileMenu();
        this.present();
    }
});

