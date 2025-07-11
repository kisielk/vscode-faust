import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('Faust Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', () => {
		assert.ok(vscode.extensions.getExtension('your-publisher-name.vscode-faust'));
	});

	test('Should register faust language', async () => {
		const doc = await vscode.workspace.openTextDocument({
			content: 'process = osc(440);',
			language: 'faust'
		});
		assert.strictEqual(doc.languageId, 'faust');
	});

	test('Should activate extension', async () => {
		const extension = vscode.extensions.getExtension('your-publisher-name.vscode-faust');
		await extension?.activate();
		assert.ok(extension?.isActive);
	});

	test('Should register commands', async () => {
		const commands = await vscode.commands.getCommands();
		assert.ok(commands.includes('faust.restartLsp'));
		assert.ok(commands.includes('faust.createConfigFile'));
	});

	test('Should handle .dsp files', async () => {
		const testContent = `
import("stdfaust.lib");
process = no.noise * 0.1;
		`;
		const doc = await vscode.workspace.openTextDocument({
			content: testContent,
			language: 'faust'
		});
		assert.strictEqual(doc.languageId, 'faust');
	});

	test('Should handle .lib files', async () => {
		const testContent = `
// Simple library file
myosc(f) = os.osc(f);
		`;
		const doc = await vscode.workspace.openTextDocument({
			content: testContent,
			language: 'faust'
		});
		assert.strictEqual(doc.languageId, 'faust');
	});
});
