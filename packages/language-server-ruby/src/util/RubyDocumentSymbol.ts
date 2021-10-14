import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver';
import { SyntaxNode } from 'web-tree-sitter';
import Position from './Position';

const SYMBOLKINDS = {
	singleton_method: SymbolKind.Method,
	method: SymbolKind.Method,
	class: SymbolKind.Class,
	module: SymbolKind.Module,
	assignment: SymbolKind.Constant,
	method_call: SymbolKind.Property,
};

const IDENTIFIER_NODES = {
	module: 'constant',
	class: 'constant',
	method: 'identifier',
	singleton_method: 'identifier',
	assignment: 'constant',
	method_call: 'identifier',
};

export function isWrapper(node: SyntaxNode): boolean {
	return IDENTIFIER_NODES.hasOwnProperty(node.type);
}

const RubyDocumentSymbol = {
	build(node: SyntaxNode): DocumentSymbol | DocumentSymbol[] | void {
		const symbolKind = SYMBOLKINDS[node.type];
		if (!symbolKind) return;

		const symbol = DocumentSymbol.create(null, null, null, null, null);
		symbol.range = Range.create(
			Position.fromTSPosition(node.startPosition).toVSPosition(),
			Position.fromTSPosition(node.endPosition).toVSPosition()
		);
		symbol.kind = symbolKind;

		if (isWrapper(node)) {
			if (!node.childCount) return;
			// Handle foo = Foo::Bar::Baz.bam showing Foo in the outline
			if (node.type === 'assignment' && node.firstChild.type === 'identifier') return;
			const identifierNode = node.descendantsOfType(IDENTIFIER_NODES[node.type])[0];
			if (identifierNode) {
				symbol.children = [];
				symbol.name = identifierNode.text;

				// Prepend self. to class methods
				if (node.type === 'singleton_method') {
					symbol.name = `self.${identifierNode.text}`;
				}

				// Override constructor type
				if (symbol.name === 'initialize') {
					symbol.kind = SymbolKind.Constructor;
				}

				// detect attr_ method calls
				if (symbol.name.indexOf('attr_') === 0) {
					const argumentList = node.descendantsOfType('argument_list')[0];
					const symbols = [];
					for (const child of argumentList.namedChildren) {
						const newSymbol = {
							...symbol,
						};
						newSymbol.name = child.text[0] === ':' ? child.text.substring(1) : child.text;
						newSymbol.selectionRange = Range.create(
							Position.fromTSPosition(child.startPosition).toVSPosition(),
							Position.fromTSPosition(child.endPosition).toVSPosition()
						);

						symbols.push(newSymbol);
					}

					return symbols;
				} else if (node.type !== 'method_call') {
					symbol.selectionRange = Range.create(
						Position.fromTSPosition(identifierNode.startPosition).toVSPosition(),
						Position.fromTSPosition(identifierNode.endPosition).toVSPosition()
					);
				} else {
					return;
				}
			} else {
				return;
			}
		} else {
			symbol.selectionRange = symbol.range;
			symbol.name = node.text;
		}

		return symbol;
	},
};

export default RubyDocumentSymbol;
