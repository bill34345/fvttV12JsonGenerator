import { dlopen, FFIType, ptr, read, type Library, type Pointer } from 'bun:ffi';
import type { CompanionProcessAggregate } from '../src/schema';

const PROCESS_QUERY_INFORMATION = 0x0400;
const PROCESS_VM_READ = 0x0010;
const MEM_COMMIT = 0x1000;
const MEM_PRIVATE = 0x20000;
const WASM_RESERVATION_BYTES = 299_958_272;

type KernelLibrary = Library<any>;

export class WindowsProcessReader {
  readonly #kernel: KernelLibrary;
  readonly #psapi: KernelLibrary;

  constructor() {
    if (process.platform !== 'win32') throw new Error('Windows process sampling is only available on Windows.');
    this.#kernel = dlopen('kernel32.dll', {
      OpenProcess: { args: [FFIType.u32, FFIType.bool, FFIType.u32], returns: FFIType.ptr },
      CloseHandle: { args: [FFIType.ptr], returns: FFIType.bool },
      VirtualQueryEx: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.u64 },
    });
    this.#psapi = dlopen('psapi.dll', {
      GetProcessMemoryInfo: { args: [FFIType.ptr, FFIType.ptr, FFIType.u32], returns: FFIType.bool },
    });
  }

  close(): void {
    this.#kernel.close();
    this.#psapi.close();
  }

  readMemory(pid: number): { workingSetBytes: number; privateBytes: number } | null {
    return this.#withProcess(pid, (handle) => {
      const buffer = new Uint8Array(80);
      new DataView(buffer.buffer).setUint32(0, buffer.byteLength, true);
      if (!this.#psapi.symbols.GetProcessMemoryInfo!(handle, ptr(buffer), buffer.byteLength)) return null;
      return {
        workingSetBytes: Number(read.u64(ptr(buffer), 16)),
        privateBytes: Number(read.u64(ptr(buffer), 72)),
      };
    });
  }

  countWasmCommittedAllocations(pid: number): number | null {
    return this.#withProcess(pid, (handle) => {
      const buffer = new Uint8Array(48);
      const allocations = new Map<bigint, bigint>();
      let address = 0;
      for (let regions = 0; regions < 2_000_000; regions++) {
        const size = Number(this.#kernel.symbols.VirtualQueryEx!(
          handle,
          address as Pointer,
          ptr(buffer),
          buffer.byteLength,
        ));
        if (!size) break;
        const baseAddress = read.u64(ptr(buffer), 0);
        const allocationBase = read.u64(ptr(buffer), 8);
        const regionSize = read.u64(ptr(buffer), 24);
        const state = read.u32(ptr(buffer), 32);
        const type = read.u32(ptr(buffer), 40);
        if (state === MEM_COMMIT && type === MEM_PRIVATE) {
          allocations.set(allocationBase, (allocations.get(allocationBase) ?? 0n) + regionSize);
        }
        const next = baseAddress + regionSize;
        if (next <= BigInt(address) || next > BigInt(Number.MAX_SAFE_INTEGER)) break;
        address = Number(next);
      }
      return Array.from(allocations.values()).filter((bytes) => bytes === BigInt(WASM_RESERVATION_BYTES)).length;
    });
  }

  #withProcess<T>(pid: number, readValue: (handle: Pointer) => T): T | null {
    const handle = this.#kernel.symbols.OpenProcess!(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
    if (!handle) return null;
    try {
      return readValue(handle);
    } finally {
      this.#kernel.symbols.CloseHandle!(handle);
    }
  }
}

export function aggregateProcesses(
  processes: Array<{ id: number; type: string; cpuTime?: number }>,
  memory: Map<number, { workingSetBytes: number; privateBytes: number } | null>,
): CompanionProcessAggregate[] {
  const groups = new Map<string, CompanionProcessAggregate>();
  for (const process of processes) {
    const current = groups.get(process.type) ?? {
      type: process.type,
      processCount: 0,
      workingSetBytes: 0,
      privateBytes: 0,
      cpuTimeSeconds: 0,
    };
    const usage = memory.get(process.id);
    current.processCount++;
    current.workingSetBytes = usage && current.workingSetBytes !== null
      ? current.workingSetBytes + usage.workingSetBytes
      : null;
    current.privateBytes = usage && current.privateBytes !== null
      ? current.privateBytes + usage.privateBytes
      : null;
    current.cpuTimeSeconds = typeof process.cpuTime === 'number' && current.cpuTimeSeconds !== null
      ? current.cpuTimeSeconds + process.cpuTime
      : null;
    groups.set(process.type, current);
  }
  return Array.from(groups.values()).sort((left, right) => left.type.localeCompare(right.type, 'en'));
}
