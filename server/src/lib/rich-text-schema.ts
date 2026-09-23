import { Schema } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

/** DOM-independent schema shared by persisted-content validation and the editor. */
export const richTextSchema = new Schema({
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block'),
  marks: basicSchema.spec.marks,
});
